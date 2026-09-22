FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_KAKAO_APP_KEY
RUN test -n "$VITE_KAKAO_APP_KEY" && npm run build

FROM ghcr.io/astral-sh/uv:latest AS uv
FROM python:3.14-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend/dist
RUN useradd --uid 10001 --create-home propsight && chown -R propsight:propsight /app
USER propsight
ENV PATH="/app/backend/.venv/bin:$PATH" SERVE_FRONTEND=1 COOKIE_SECURE=1 PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
