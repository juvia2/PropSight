from contextlib import asynccontextmanager

from sqlalchemy import text

from database import engine
from models import Base


def initialize_database():
    with engine.begin() as connection:
        connection.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
        Base.metadata.create_all(connection)
        for table in ('properties', 'commercial_blocks'):
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)'))
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id)'))
            connection.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ'))
            connection.execute(text(f'ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP'))
            connection.execute(text(f'CREATE INDEX IF NOT EXISTS ix_{table}_created_by ON {table}(created_by)'))
            connection.execute(text(f'CREATE INDEX IF NOT EXISTS ix_{table}_team_id ON {table}(team_id)'))


@asynccontextmanager
async def lifespan(app):
    initialize_database()
    yield
