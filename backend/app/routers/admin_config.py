"""Admin configuration management endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin
from app.models.database import User, get_db
from app.models.schemas import AppConfigListResponse, AppConfigResponse, AppConfigUpdateRequest
from app.services import config_service
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1", tags=["config"])

audit_service = AuditService()

# Whitelist of valid config keys with expected types and validation
VALID_KEYS: dict[str, dict[str, Any]] = {
    "chat_model": {"type": str},
    "embedding_model": {"type": str},
    "ocr_model": {"type": str},
    "chunk_size": {"type": int, "min": 100, "max": 10000},
    "chunk_overlap": {"type": int, "min": 0},
    "rag_top_k": {"type": int, "min": 1, "max": 100},
    "max_upload_files": {"type": int, "min": 1, "max": 100},
    "max_file_size_mb": {"type": int, "min": 1, "max": 500},
    "usd_to_xaf_rate": {"type": float, "min": 0.01},
    "chat_max_tokens": {"type": int, "min": 100, "max": 32000},
    "batch_timeout_minutes": {"type": int, "min": 1, "max": 120},
    "rerank_model": {"type": str},
    "rerank_top_k": {"type": int, "min": 1, "max": 50},
    "rerank_enabled": {"type": bool},
}


def _validate_value(key: str, value: Any) -> Any:
    """Validate and coerce a config value. Returns coerced value or raises HTTPException."""
    if key not in VALID_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Clé de configuration inconnue : '{key}'",
        )

    spec = VALID_KEYS[key]
    expected_type = spec["type"]

    # Coerce value
    try:
        if expected_type is int:
            coerced = int(value)
        elif expected_type is float:
            coerced = float(value)
        elif expected_type is bool:
            if isinstance(value, bool):
                coerced = value
            elif isinstance(value, str):
                if value.lower() in ("true", "1", "yes", "oui"):
                    coerced = True
                elif value.lower() in ("false", "0", "no", "non"):
                    coerced = False
                else:
                    raise ValueError("not a boolean")
            else:
                coerced = bool(value)
        elif expected_type is str:
            coerced = str(value)
            if not coerced.strip():
                raise ValueError("empty")
        else:
            coerced = value
    except (ValueError, TypeError):
        type_name = {"int": "entier", "float": "nombre décimal", "str": "chaîne de caractères", "bool": "booléen"}
        raise HTTPException(
            status_code=400,
            detail=f"Valeur invalide pour '{key}' : un {type_name.get(expected_type.__name__, expected_type.__name__)} est attendu",
        )

    # Range checks
    if "min" in spec and coerced < spec["min"]:
        raise HTTPException(
            status_code=400,
            detail=f"Valeur trop petite pour '{key}' : minimum {spec['min']}",
        )
    if "max" in spec and coerced > spec["max"]:
        raise HTTPException(
            status_code=400,
            detail=f"Valeur trop grande pour '{key}' : maximum {spec['max']}",
        )

    return coerced


def _validate_cross_constraints(updates: dict[str, Any], db_values: dict[str, Any]) -> None:
    """Validate constraints that span multiple keys (e.g., overlap < size)."""
    # Merge current DB values with updates to check cross-constraints
    merged = {**db_values, **updates}

    chunk_size = merged.get("chunk_size")
    chunk_overlap = merged.get("chunk_overlap")

    if chunk_size is not None and chunk_overlap is not None:
        if chunk_overlap >= chunk_size:
            raise HTTPException(
                status_code=400,
                detail=f"Le chevauchement ({chunk_overlap}) doit être inférieur à la taille du chunk ({chunk_size})",
            )


@router.get("/config", response_model=AppConfigListResponse)
async def get_config(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """Return all configuration entries."""
    configs = await config_service.get_all(db)
    return AppConfigListResponse(
        configs=[AppConfigResponse.model_validate(c) for c in configs]
    )


@router.put("/config", response_model=AppConfigListResponse)
async def update_config(
    body: AppConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Update configuration values (admin only)."""
    if not body.values:
        raise HTTPException(status_code=400, detail="Aucune valeur fournie")

    # Validate each value individually
    coerced: dict[str, Any] = {}
    for key, value in body.values.items():
        coerced[key] = _validate_value(key, value)

    # Load current DB values for cross-constraint checks
    all_configs = await config_service.get_all(db)
    db_values = {c.key: c.value for c in all_configs}

    _validate_cross_constraints(coerced, db_values)

    # Apply updates
    try:
        updated = await config_service.set_many(coerced, db)
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Clé de configuration inconnue : '{e.args[0]}'",
        )

    # Audit log
    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="config_changed",
        entity_type="app_config",
        details={
            "updated_keys": list(coerced.keys()),
            "new_values": coerced,
        },
    )

    await db.commit()

    # Return all configs after update
    configs = await config_service.get_all(db)
    return AppConfigListResponse(
        configs=[AppConfigResponse.model_validate(c) for c in configs]
    )
