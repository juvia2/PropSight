"""Local account authentication with hashed, expiring server-side sessions."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models import Team, User, LoginSession

router = APIRouter(prefix='/api')
COOKIE = 'propsight_session'
ORIGINS = {'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8000', 'http://127.0.0.1:8000'}

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'{salt}:{hashed}'

def verify_password(password, stored):
    salt = stored.split(':')[0]
    return hmac.compare_digest(password_hash(password, salt), stored)

def check_origin(request):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        if origin and origin not in ORIGINS:
            raise HTTPException(403, '허용되지 않은 요청 출처입니다.')
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise HTTPException(403, '외부 사이트 요청은 허용되지 않습니다.')

def current_user(request: Request, db: Session = Depends(get_db)):
    check_origin(request)
    token = request.cookies.get(COOKIE)
    session = db.get(LoginSession, digest(token)) if token else None
    if not session or session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, '로그인이 필요합니다.')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, '유효하지 않은 계정입니다.')
    return user

CurrentUser = Annotated[User, Depends(current_user)]

def user_info(db, user):
    team = db.get(Team, user.team_id)
    return {'id': user.id, 'username': user.username, 'display_name': user.display_name,
            'team_id': user.team_id, 'team_name': team.name, 'is_team_admin': user.is_team_admin}

def start_session(db, user, response):
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_hash=digest(token), user_id=user.id, expires_at=datetime.now(timezone.utc) + timedelta(hours=12)))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, samesite='lax', secure=os.getenv('COOKIE_SECURE') == '1', max_age=43200, path='/')

class Credentials(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=False)
    username: str = Field(pattern=r'^[a-zA-Z0-9_.-]{3,50}$')
    password: str = Field(min_length=8, max_length=128)

class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=100)
    team_name: str | None = Field(default=None, min_length=1, max_length=100)
    invite_code: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode='after')
    def clean(self):
        self.display_name = self.display_name.strip()
        self.team_name = self.team_name.strip() if self.team_name else None
        self.invite_code = self.invite_code.strip() if self.invite_code else None
        if not self.display_name or bool(self.team_name) == bool(self.invite_code):
            raise ValueError('이름과 새 팀 이름 또는 팀 초대 코드가 필요합니다.')
        return self

@router.post('/auth/register', status_code=201)
def register(payload: Registration, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    username = payload.username.lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, '이미 사용 중인 아이디입니다.')
    invite_code = None
    if payload.invite_code:
        team = db.scalar(select(Team).where(Team.invite_hash == digest(payload.invite_code)))
        if not team:
            raise HTTPException(422, '팀 초대 코드가 올바르지 않습니다.')
    else:
        invite_code = secrets.token_urlsafe(24)
        team = Team(name=payload.team_name, invite_hash=digest(invite_code))
        db.add(team)
    try:
        db.flush()
        user = User(username=username, display_name=payload.display_name, password_hash=password_hash(payload.password), team_id=team.id, is_team_admin=bool(invite_code))
        db.add(user)
        db.flush()
        start_session(db, user, response)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '아이디 또는 팀 이름이 이미 사용 중입니다.')
    return {'user': user_info(db, user), 'invite_code': invite_code}

@router.post('/auth/login')
def login(payload: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    user = db.scalar(select(User).where(User.username == payload.username.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, '아이디 또는 비밀번호를 확인하세요.')
    old = request.cookies.get(COOKIE)
    old_session = db.get(LoginSession, digest(old)) if old else None
    if old_session:
        db.delete(old_session)
    start_session(db, user, response)
    return {'user': user_info(db, user)}

@router.get('/auth/me')
def me(user: CurrentUser, db: Session = Depends(get_db)):
    return user_info(db, user)

@router.post('/auth/logout', status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    token = request.cookies.get(COOKIE)
    session = db.get(LoginSession, digest(token)) if token else None
    if session:
        db.delete(session)
        db.commit()
    response.delete_cookie(COOKIE, path='/')
    response.status_code = 204

@router.get('/directory')
def directory(user: CurrentUser, db: Session = Depends(get_db)):
    return {'teams': [{'id': t.id, 'name': t.name} for t in db.scalars(select(Team).order_by(Team.name))],
            'users': [user_info(db, u) for u in db.scalars(select(User).order_by(User.display_name))]}

@router.post('/team/invite')
def new_invite(user: CurrentUser, db: Session = Depends(get_db)):
    if not user.is_team_admin:
        raise HTTPException(403, '팀을 만든 계정만 초대 코드를 발급할 수 있습니다.')
    code = secrets.token_urlsafe(24)
    db.get(Team, user.team_id).invite_hash = digest(code)
    db.commit()
    return {'invite_code': code}
