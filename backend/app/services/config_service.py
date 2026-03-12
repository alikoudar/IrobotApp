"""ConfigService — read-through cache for app_config table via Redis."""

import json
import logging
from typing import Any

import redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import AppConfig

logger = logging.getLogger(__name__)

CACHE_TTL = 60  # seconds
CACHE_PREFIX = "config:"


def _get_redis() -> redis.Redis:
    """Create a fresh Redis client (safe across event loops)."""
    settings = get_settings()
    return redis.from_url(settings.redis_url, decode_responses=True)


async def get_value(key: str, db: AsyncSession) -> Any:
    """Get a config value: Redis cache → DB → env fallback."""
    # Try Redis cache
    try:
        r = _get_redis()
        cached = r.get(f"{CACHE_PREFIX}{key}")
        if cached is not None:
            return json.loads(cached)
    except Exception:
        logger.debug("Redis cache miss/error for config key %s", key)

    # Try DB
    result = await db.execute(
        select(AppConfig.value).where(AppConfig.key == key)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        # row is the JSONB value stored in the DB
        val = row
        # Cache it
        try:
            r = _get_redis()
            r.set(f"{CACHE_PREFIX}{key}", json.dumps(val), ex=CACHE_TTL)
        except Exception:
            logger.debug("Failed to cache config key %s", key)
        return val

    # Fallback to env settings
    settings = get_settings()
    fallback = getattr(settings, key, None)
    return fallback


async def get_all(db: AsyncSession) -> list[AppConfig]:
    """Return all config entries from DB."""
    result = await db.execute(
        select(AppConfig).order_by(AppConfig.category, AppConfig.key)
    )
    return list(result.scalars().all())


async def set_value(
    key: str, value: Any, db: AsyncSession, user_id: str | None = None
) -> AppConfig:
    """Update a config value in DB and invalidate Redis cache."""
    result = await db.execute(
        select(AppConfig).where(AppConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise KeyError(key)

    config.value = value
    if user_id:
        import uuid
        config.updated_by = uuid.UUID(user_id)

    await db.flush()

    # Invalidate cache
    try:
        r = _get_redis()
        r.delete(f"{CACHE_PREFIX}{key}")
    except Exception:
        logger.debug("Failed to invalidate cache for key %s", key)

    return config


async def set_many(
    updates: dict[str, Any], db: AsyncSession, user_id: str | None = None
) -> list[AppConfig]:
    """Bulk update config values."""
    updated = []
    for key, value in updates.items():
        config = await set_value(key, value, db, user_id)
        updated.append(config)
    return updated
