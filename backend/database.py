import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'), override=False)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

database_url = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:root@127.0.0.1:5432/propsight')
if database_url.startswith(('postgres://', 'postgresql://')):
    database_url = 'postgresql+psycopg2://' + database_url.split('://', 1)[1]
engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

def get_db():
    with SessionLocal() as session:
        yield session
