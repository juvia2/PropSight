import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import router as auth_router
from database import get_db
from deployment import ALLOWED_ORIGINS
from migrations import lifespan
from public_data import router as public_data_router
from records import router as records_router


app = FastAPI(title='PropSight API', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_methods=['*'],
    allow_headers=['*'],
    allow_credentials=True,
)
app.include_router(auth_router)
app.include_router(public_data_router)
app.include_router(records_router)


@app.get('/health')
def health(db: Session = Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {'status': 'ok', 'database': 'PostGIS'}


frontend_dist = Path(os.getenv('FRONTEND_DIST', Path(__file__).resolve().parents[1] / 'frontend' / 'dist'))
if os.getenv('SERVE_FRONTEND') == '1':
    if not (frontend_dist / 'index.html').is_file():
        raise RuntimeError('Frontend build is missing. Build the deployment image first.')
    app.mount('/', StaticFiles(directory=frontend_dist, html=True), name='frontend')
