import json
import math
import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from deployment import ALLOWED_ORIGINS
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func, text, delete
from sqlalchemy.orm import Session
from database import engine, get_db
from models import Base, Property, CommercialBlock, User, Team, MemoRevision, Attachment, PublicDataSnapshot
from auth import router as auth_router, CurrentUser
from attachments import register_attachments
from public_data import router as public_data_router, register_public_data

Category = Literal['개발계획', '상권분석', '진행매물']

class GeometryInput(BaseModel):
    type: Literal['Point', 'Polygon']
    coordinates: list

    @model_validator(mode='after')
    def validate_coordinates(self):
        def position(p):
            if not isinstance(p, list) or len(p) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p):
                raise ValueError('좌표는 [경도, 위도] 형식이어야 합니다.')
            if not -180 <= p[0] <= 180 or not -90 <= p[1] <= 90:
                raise ValueError('좌표 범위를 확인하세요.')
        if self.type == 'Point':
            position(self.coordinates)
        else:
            if not self.coordinates:
                raise ValueError('다각형 좌표가 필요합니다.')
            for ring in self.coordinates:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError('다각형은 닫힌 링과 최소 3개 꼭짓점이 필요합니다.')
                for p in ring:
                    position(p)
        return self

class FeatureInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    memo: str = Field(default='', max_length=10000)
    category: Category
    geometry: GeometryInput

    model_config = {"extra": "forbid"}

    @model_validator(mode='after')
    def trim_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError('이름을 입력하세요.')
        return self

@asynccontextmanager
async def lifespan(app):
    with engine.begin() as connection:
        connection.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
        Base.metadata.create_all(connection)
        # Additive migration: historical records retain NULL ownership.
        for table in ('properties', 'commercial_blocks'):
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)'))
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id)'))
            # Historical rows have no reliable creation time; leave them NULL.
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ'))
            connection.execute(text(f'ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP'))
            connection.execute(text(f'CREATE INDEX IF NOT EXISTS ix_{table}_created_by ON {table}(created_by)'))
            connection.execute(text(f'CREATE INDEX IF NOT EXISTS ix_{table}_team_id ON {table}(team_id)'))
    yield

app = FastAPI(title='PropSight API', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=sorted(ALLOWED_ORIGINS), allow_methods=['*'], allow_headers=['*'], allow_credentials=True)

app.include_router(auth_router)
app.include_router(public_data_router)

def feature(db, row):
    geometry = db.scalar(select(func.ST_AsGeoJSON(row.geometry)))
    author = db.get(User, row.created_by) if row.created_by else None
    team = db.get(Team, row.team_id) if row.team_id else None
    return {'type': 'Feature', 'id': row.id, 'geometry': json.loads(geometry), 'properties': {'id': row.id, 'name': row.name, 'memo': row.memo, 'category': row.category, 'created_at': row.created_at.isoformat() if row.created_at else None, 'created_by': row.created_by, 'team_id': row.team_id, 'author_name': author.display_name if author else '작성자 미지정', 'author_username': author.username if author else None, 'team_name': team.name if team else '팀 미지정'}}

@app.get('/health')
def health(db: Session = Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {'status': 'ok', 'database': 'PostGIS'}

def register(resource, model, geometry_type):
    register_attachments(app, resource, model)
    register_public_data(app, resource, model)
    def get_row(db, item_id):
        row = db.get(model, item_id)
        if row is None:
            raise HTTPException(404, '데이터를 찾을 수 없습니다.')
        return row

    def assign(db, row, payload, user):
        if payload.geometry.type != geometry_type:
            raise HTTPException(422, f'{geometry_type} geometry가 필요합니다.')
        geom = func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(payload.geometry.model_dump())), 4326)
        if not db.scalar(select(func.ST_IsValid(geom))):
            raise HTTPException(422, '교차하지 않는 유효한 다각형을 그려주세요.')
        row.name, row.memo, row.category = payload.name, payload.memo, payload.category
        row.geometry = geom
        db.add(row)
        db.flush()
        db.add(MemoRevision(resource=resource, record_id=row.id, memo=payload.memo, author_id=user.id))
        db.commit()
        db.refresh(row)
        return feature(db, row)

    @app.get(f'/api/{resource}', name=f'list_{resource}')
    def list_items(user: CurrentUser, category: Category | None = None, team_id: int | None = None, created_by: int | None = None, db: Session = Depends(get_db)):
        query = select(model).order_by(model.id.desc())
        if category:
            query = query.where(model.category == category)
        if team_id is not None:
            query = query.where(model.team_id == team_id)
        if created_by is not None:
            query = query.where(model.created_by == created_by)
        return {'type': 'FeatureCollection', 'features': [feature(db, row) for row in db.scalars(query)]}

    @app.get(f'/api/{resource}/{{item_id}}', name=f'get_{resource}')
    def get_item(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        return feature(db, get_row(db, item_id))

    @app.get(f'/api/{resource}/{{item_id}}/revisions', name=f'list_{resource}_revisions')
    def list_revisions(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        get_row(db, item_id)
        revisions = db.scalars(select(MemoRevision).where(
            MemoRevision.resource == resource, MemoRevision.record_id == item_id
        ).order_by(MemoRevision.id.desc())).all()
        author_ids = {revision.author_id for revision in revisions}
        authors = {person.id: person for person in db.scalars(select(User).where(User.id.in_(author_ids)))} if author_ids else {}
        return [{'id': revision.id, 'memo': revision.memo, 'saved_at': revision.saved_at.isoformat(),
                 'author_id': revision.author_id,
                 'author_username': authors[revision.author_id].username,
                 'author_name': authors[revision.author_id].display_name} for revision in revisions]

    @app.post(f'/api/{resource}', status_code=201, name=f'create_{resource}')
    def create_item(payload: FeatureInput, user: CurrentUser, db: Session = Depends(get_db)):
        return assign(db, model(created_by=user.id, team_id=user.team_id), payload, user)

    @app.put(f'/api/{resource}/{{item_id}}', name=f'update_{resource}')
    def update_item(item_id: int, payload: FeatureInput, user: CurrentUser, db: Session = Depends(get_db)):
        row = get_row(db, item_id)
        if row.created_by != user.id:
            raise HTTPException(403, '작성자만 수정할 수 있습니다.')
        return assign(db, row, payload, user)

    @app.delete(f'/api/{resource}/{{item_id}}', status_code=204, name=f'delete_{resource}')
    def delete_item(item_id: int, user: CurrentUser, db: Session = Depends(get_db)):
        row = db.scalar(select(model).where(model.id == item_id).with_for_update())
        if row is None:
            raise HTTPException(404, '데이터를 찾을 수 없습니다.')
        if row.created_by != user.id:
            raise HTTPException(403, '작성자만 삭제할 수 있습니다.')
        db.execute(delete(MemoRevision).where(MemoRevision.resource == resource, MemoRevision.record_id == item_id))
        db.execute(delete(PublicDataSnapshot).where(PublicDataSnapshot.resource == resource, PublicDataSnapshot.record_id == item_id))
        db.execute(delete(Attachment).where(Attachment.resource == resource, Attachment.record_id == item_id))
        db.delete(row)
        db.commit()
        return Response(status_code=204)

register('properties', Property, 'Point')
register('commercial_blocks', CommercialBlock, 'Polygon')

# Mount after API routes so production serves the UI and API on one origin.
frontend_dist = Path(os.getenv('FRONTEND_DIST', Path(__file__).resolve().parents[1] / 'frontend' / 'dist'))
if os.getenv('SERVE_FRONTEND') == '1':
    if not (frontend_dist / 'index.html').is_file():
        raise RuntimeError('Frontend build is missing. Build the deployment image first.')
    app.mount('/', StaticFiles(directory=frontend_dist, html=True), name='frontend')
