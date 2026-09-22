from datetime import datetime
from sqlalchemy import String, Text, CheckConstraint, ForeignKey, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from geoalchemy2 import Geometry

class Base(DeclarativeBase):
    pass

class Property(Base):
    __tablename__ = 'properties'
    __table_args__ = (CheckConstraint("category IN ('개발계획', '상권분석', '진행매물')"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    memo: Mapped[str] = mapped_column(Text, default='')
    category: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id'), index=True)
    geometry = mapped_column(Geometry('POINT', srid=4326), nullable=False)

class CommercialBlock(Base):
    __tablename__ = 'commercial_blocks'
    __table_args__ = (CheckConstraint("category IN ('개발계획', '상권분석', '진행매물')"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    memo: Mapped[str] = mapped_column(Text, default='')
    category: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, server_default=func.now())
    created_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id'), index=True)
    geometry = mapped_column(Geometry('POLYGON', srid=4326), nullable=False)

class Team(Base):
    __tablename__ = 'teams'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    invite_hash: Mapped[str] = mapped_column(String(64), unique=True)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(256))
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id'), index=True)
    is_team_admin: Mapped[bool] = mapped_column(default=False)

class LoginSession(Base):
    __tablename__ = 'login_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
