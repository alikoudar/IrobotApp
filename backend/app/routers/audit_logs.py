"""Audit logs router — query, filter, and archive audit trail."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin
from app.models.database import User, get_db
from app.models.schemas import AuditLogListResponse
from app.services.audit_service import AuditService
from app.services.minio_service import MinIOService

router = APIRouter(prefix="/api/v1", tags=["audit"])

audit_service = AuditService()
_minio_service = MinIOService()


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: str | None = Query(None, description="Filtrer par action (ex: document_uploaded)"),
    user_id: uuid.UUID | None = Query(None, description="Filtrer par identifiant utilisateur"),
    entity_type: str | None = Query(None, description="Filtrer par type d'entité (ex: document)"),
    date_from: datetime | None = Query(None, description="Date de début (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Date de fin (ISO 8601)"),
    limit: int = Query(50, ge=1, le=200, description="Nombre de résultats par page"),
    offset: int = Query(0, ge=0, description="Décalage pour la pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Liste paginée et filtrable des journaux d'audit."""
    logs, total = await audit_service.get_logs(
        db=db,
        action=action,
        user_id=user_id,
        entity_type=entity_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return AuditLogListResponse(logs=logs, total=total, limit=limit, offset=offset)


@router.post("/audit-logs/archive")
async def archive_audit_logs(
    date_before: datetime | None = Query(
        None, description="Archiver les logs avant cette date (ISO 8601). Par défaut : 24h."
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Archiver les journaux d'audit dans MinIO et les supprimer de la base."""
    if date_before is None:
        date_before = datetime.utcnow() - timedelta(hours=24)

    result = await audit_service.archive_logs(db, _minio_service, date_before)
    await db.commit()

    if result["archived_count"] == 0:
        return {"message": "Aucun journal à archiver", "archived_count": 0}

    return {
        "message": f"{result['archived_count']} journaux archivés",
        "archived_count": result["archived_count"],
        "file_key": result["file_key"],
    }


@router.get("/audit-logs/archives")
async def list_audit_archives(
    current_user: User = Depends(get_current_admin),
):
    """Lister les fichiers d'archives de journaux d'audit."""
    archives = audit_service.list_archives(_minio_service)
    # Replace direct MinIO presigned URLs with backend proxy URLs
    for archive in archives:
        archive["download_url"] = f"/api/v1/audit-logs/archives/{archive['name']}/download"
    return {"archives": archives}


@router.get("/audit-logs/archives/{filename}/download")
async def download_audit_archive(
    filename: str,
    current_user: User = Depends(get_current_admin),
):
    """Télécharger un fichier d'archive de journaux d'audit."""
    try:
        data = await _minio_service.download_file("audit-archives", filename)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier d'archive introuvable")

    return StreamingResponse(
        iter([data]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
