import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_manager_or_admin, get_current_user
from app.models.database import AuditLog, Chunk, Document, User, get_db
from app.models.schemas import (
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUpdateRequest,
)
from app.services.audit_service import AuditService
from app.services.minio_service import MinIOService

router = APIRouter(prefix="/api/v1", tags=["documents"])
audit_service = AuditService()
minio_service = MinIOService()


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
    uploaded_by: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste des documents avec filtres et pagination."""
    limit = min(limit, 200)

    filters = []
    if status:
        filters.append(Document.processing_status == status)
    if category:
        filters.append(Document.category == category)
    if search:
        filters.append(Document.filename.ilike(f"%{search}%"))
    if uploaded_by:
        filters.append(User.matricule.ilike(f"%{uploaded_by}%"))

    base_query = select(Document, User.matricule).outerjoin(User, Document.uploaded_by == User.id)

    count_stmt = select(func.count(Document.id)).select_from(Document).outerjoin(User, Document.uploaded_by == User.id).where(*filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base_query
        .where(*filters)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.all()

    documents = []
    for doc, matricule in rows:
        d = DocumentResponse.model_validate(doc)
        d.uploader_matricule = matricule
        documents.append(d)

    return DocumentListResponse(
        documents=documents,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/documents/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Détails d'un document avec nombre de chunks."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    chunk_count_stmt = select(func.count(Chunk.id)).where(Chunk.document_id == document_id)
    chunk_count = (await db.execute(chunk_count_stmt)).scalar() or 0

    data = DocumentDetailResponse.model_validate(doc)
    data.chunk_count = chunk_count

    if doc.uploaded_by:
        uploader = await db.get(User, doc.uploaded_by)
        if uploader:
            data.uploader_name = uploader.name
            data.uploader_matricule = uploader.matricule

    return data


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Suppression en cascade (DB + MinIO)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    doc_id_str = str(document_id)
    for bucket in ("uploads", "processed", "ocr-images"):
        await minio_service.delete_prefix(bucket, f"{doc_id_str}/")

    await db.delete(doc)

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="document_deleted",
        entity_type="document",
        entity_id=document_id,
        details={"filename": doc.filename},
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Mise à jour de la catégorie d'un document."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    old_category = doc.category
    if body.category is not None:
        doc.category = body.category
    doc.updated_at = datetime.utcnow()

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="document_updated",
        entity_type="document",
        entity_id=document_id,
        details={"old_category": old_category, "new_category": body.category},
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vérification rapide du statut d'un document."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return DocumentStatusResponse.model_validate(doc)


@router.post("/documents/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Relancer le traitement d'un document en échec (max 3 tentatives)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    if doc.processing_status != "failed":
        raise HTTPException(
            status_code=400,
            detail="Seuls les documents en échec peuvent être relancés",
        )

    # Count previous retries via audit logs
    retry_count_stmt = select(func.count(AuditLog.id)).where(
        AuditLog.action == "document_retry",
        AuditLog.entity_id == document_id,
    )
    retry_count = (await db.execute(retry_count_stmt)).scalar() or 0

    if retry_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="Nombre maximum de tentatives atteint (3)",
        )

    doc.processing_status = "uploaded"
    doc.error_message = None
    doc.updated_at = datetime.utcnow()

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="document_retry",
        entity_type="document",
        entity_id=document_id,
        details={"retry_number": retry_count + 1, "filename": doc.filename},
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(doc)

    # Dispatch Celery task
    from app.workers.tasks import process_document
    process_document.delay(str(document_id))

    return DocumentResponse.model_validate(doc)


@router.get("/documents/{document_id}/chunks")
async def get_document_chunks(
    document_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return paginated chunks for a document."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    limit = min(limit, 200)

    count_stmt = select(func.count(Chunk.id)).where(Chunk.document_id == document_id)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Chunk)
        .where(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    chunks = list(result.scalars().all())

    from app.models.schemas import ChunkResponse, DocumentChunksResponse
    return DocumentChunksResponse(
        document_id=document_id,
        chunks=[
            ChunkResponse(
                id=c.id,
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                content=c.content,
                token_count=c.token_count,
                metadata=c.chunk_metadata or {},
            )
            for c in chunks
        ],
        total=total,
    )
