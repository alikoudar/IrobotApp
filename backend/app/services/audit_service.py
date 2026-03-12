import io
import json
import uuid
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AuditLog


class AuditService:
    """Service for audit logging."""

    async def log(
        self,
        db: AsyncSession,
        user_id: uuid.UUID | None,
        action: str,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        details: dict | None = None,
        ip_address: str | None = None,
    ) -> None:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()

    async def get_logs(
        self,
        db: AsyncSession,
        action: str | None = None,
        user_id: uuid.UUID | None = None,
        entity_type: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AuditLog], int]:
        """Query audit logs with filters and pagination."""
        filters = []
        if action:
            filters.append(AuditLog.action == action)
        if user_id:
            filters.append(AuditLog.user_id == user_id)
        if entity_type:
            filters.append(AuditLog.entity_type == entity_type)
        if date_from:
            filters.append(AuditLog.created_at >= date_from)
        if date_to:
            filters.append(AuditLog.created_at <= date_to)

        # Count
        count_stmt = select(func.count(AuditLog.id)).where(*filters)
        total = (await db.execute(count_stmt)).scalar() or 0

        # Fetch
        stmt = (
            select(AuditLog)
            .where(*filters)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        logs = list(result.scalars().all())

        return logs, total

    async def archive_logs(
        self,
        db: AsyncSession,
        minio_service,
        date_before: datetime | None = None,
    ) -> dict:
        """Archive audit logs to MinIO and delete from DB."""
        filters = []
        if date_before:
            filters.append(AuditLog.created_at < date_before)

        # Fetch logs to archive
        stmt = select(AuditLog).where(*filters).order_by(AuditLog.created_at)
        result = await db.execute(stmt)
        logs = list(result.scalars().all())

        if not logs:
            return {"archived_count": 0, "file_key": None}

        # Serialize to JSON
        records = []
        for log in logs:
            records.append({
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": str(log.entity_id) if log.entity_id else None,
                "details": log.details,
                "ip_address": str(log.ip_address) if log.ip_address else None,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

        json_data = json.dumps(records, ensure_ascii=False, indent=2).encode("utf-8")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_key = f"audit-archives/audit_{timestamp}_{len(records)}.json"

        # Upload to MinIO
        minio_service.client.put_object(
            "audit-archives",
            f"audit_{timestamp}_{len(records)}.json",
            io.BytesIO(json_data),
            len(json_data),
            content_type="application/json",
        )

        # Delete archived logs from DB
        log_ids = [log.id for log in logs]
        await db.execute(delete(AuditLog).where(AuditLog.id.in_(log_ids)))
        await db.flush()

        return {"archived_count": len(records), "file_key": file_key}

    def list_archives(self, minio_service) -> list[dict]:
        """List archived audit log files in MinIO."""
        try:
            objects = minio_service.client.list_objects("audit-archives", recursive=True)
            archives = []
            for obj in objects:
                # Generate presigned URL
                url = minio_service.client.presigned_get_object(
                    "audit-archives", obj.object_name
                )
                archives.append({
                    "name": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                    "download_url": url,
                })
            return archives
        except Exception:
            return []
