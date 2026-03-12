import logging
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from minio import Minio
from sqlalchemy import text

from app.config import get_settings
from app.models.database import engine
from app.models.schemas import HealthResponse, ServiceStatus
from app.routers import admin_config, audit_logs, auth, categories, chat, dashboard, documents, upload, users

logger = logging.getLogger(__name__)


def run_migrations():
    """Run Alembic migrations on startup via subprocess to avoid event loop conflicts."""
    try:
        backend_dir = Path(__file__).resolve().parent.parent
        result = subprocess.run(
            ["uv", "run", "alembic", "upgrade", "head"],
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            logger.error("Échec des migrations : %s", result.stderr)
            raise RuntimeError(result.stderr)
        logger.info("Migrations appliquées avec succès")
        print("INFO:     Migrations appliquées avec succès")
    except subprocess.TimeoutExpired:
        logger.error("Timeout lors de l'application des migrations")
        raise
    except Exception as e:
        logger.error("Erreur lors de l'application des migrations : %s", e)
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    yield


app = FastAPI(
    title="RAG Chatbot API",
    version="0.1.0",
    description="API pour le chatbot RAG documentaire BEAC",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(categories.router)
app.include_router(dashboard.router)
app.include_router(admin_config.router)
app.include_router(audit_logs.router)


@app.get("/api/v1/health", response_model=HealthResponse)
async def health_check():
    """Check health of all backend services."""
    settings = get_settings()
    services = ServiceStatus()

    # Check PostgreSQL
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        services.postgres = "ok"
    except Exception as e:
        logger.error("PostgreSQL health check failed: %s", e)
        services.postgres = "error"

    # Check Redis
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.aclose()
        services.redis = "ok"
    except Exception as e:
        logger.error("Redis health check failed: %s", e)
        services.redis = "error"

    # Check MinIO
    try:
        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_root_user,
            secret_key=settings.minio_root_password,
            secure=settings.minio_secure,
        )
        client.list_buckets()
        services.minio = "ok"
    except Exception as e:
        logger.error("MinIO health check failed: %s", e)
        services.minio = "error"

    all_ok = all(
        v == "ok" for v in [services.postgres, services.redis, services.minio]
    )
    return HealthResponse(
        status="ok" if all_ok else "degraded",
        services=services,
    )
