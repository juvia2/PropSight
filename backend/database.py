import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:root@127.0.0.1:5432/propsight'), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    with SessionLocal() as session:
        yield session
