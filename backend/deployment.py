"""Shared allowed origins for local development and HTTPS deployments."""
import os
from database import get_db  # Load local dotenv before reading configuration.

DEFAULT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000'
ALLOWED_ORIGINS = {value.strip().rstrip('/') for value in os.getenv('ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(',') if value.strip()}

# Render supplies the service's own public origin as a trusted environment value.
render_origin = os.getenv('RENDER_EXTERNAL_URL', '').strip().rstrip('/')
if render_origin:
    ALLOWED_ORIGINS.add(render_origin)
