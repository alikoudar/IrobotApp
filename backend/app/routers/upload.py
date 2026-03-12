import hashlib
import mimetypes
import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_manager_or_admin
from app.models.database import Document, User, get_db
from app.services import config_service
from app.models.schemas import DocumentResponse, FileError, URLUploadRequest, UploadResponse
from app.services.audit_service import AuditService
from app.services.minio_service import MinIOService
from app.services.url_service import URLFetchError, URLService
from app.workers.tasks import process_document

router = APIRouter(prefix="/api/v1", tags=["upload"])

ALLOWED_EXTENSIONS = {
    ".txt", ".rtf", ".docx", ".xlsx", ".pptx",
    ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp",
}

minio_service = MinIOService()
audit_service = AuditService()
url_service = URLService()


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    request: Request,
    files: list[UploadFile],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    max_upload_files = await config_service.get_value("max_upload_files", db)
    max_file_size_mb = await config_service.get_value("max_file_size_mb", db)

    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    if len(files) > max_upload_files:
        raise HTTPException(
            status_code=400,
            detail=f"Nombre maximum de fichiers dépassé ({max_upload_files})",
        )

    documents: list[DocumentResponse] = []
    errors: list[FileError] = []

    for file in files:
        filename = file.filename or "unnamed"
        ext = PurePosixPath(filename).suffix.lower()

        # Validate extension
        if ext not in ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
            errors.append(FileError(
                filename=filename,
                error=f"Extension non autorisée : {ext}. Extensions acceptées : {allowed}",
            ))
            continue

        # Read file content
        content = await file.read()

        # Validate size
        max_bytes = max_file_size_mb * 1024 * 1024
        if len(content) > max_bytes:
            errors.append(FileError(
                filename=filename,
                error=f"Le fichier '{filename}' dépasse la taille maximale de {max_file_size_mb}MB",
            ))
            continue

        # Compute hash for dedup
        file_hash = hashlib.sha256(content).hexdigest()

        # Check duplicate
        result = await db.execute(
            select(Document).where(Document.file_hash == file_hash)
        )
        existing = result.scalar_one_or_none()
        if existing:
            errors.append(FileError(
                filename=filename,
                error=f"Fichier dupliqué : déjà téléversé sous le nom {existing.filename}",
            ))
            continue

        # Upload to MinIO
        doc_id = uuid.uuid4()
        minio_key = f"{doc_id}/{filename}"
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        await minio_service.upload_file("uploads", minio_key, content, content_type)

        # Create DB record
        doc = Document(
            id=doc_id,
            filename=filename,
            original_extension=ext,
            mime_type=content_type,
            file_size_bytes=len(content),
            file_hash=file_hash,
            minio_bucket="uploads",
            minio_key=minio_key,
            processing_status="uploaded",
            uploaded_by=current_user.id,
        )
        db.add(doc)
        await db.flush()

        # Audit log
        await audit_service.log(
            db=db,
            user_id=current_user.id,
            action="document_uploaded",
            entity_type="document",
            entity_id=doc_id,
            details={"filename": filename, "size_bytes": len(content), "extension": ext},
            ip_address=request.client.host if request.client else None,
        )

        documents.append(DocumentResponse.model_validate(doc))

    await db.commit()

    # Dispatch processing tasks after commit
    for doc_resp in documents:
        process_document.delay(str(doc_resp.id))

    return UploadResponse(documents=documents, errors=errors)


@router.post("/upload-url", response_model=UploadResponse)
async def upload_url(
    request: Request,
    body: URLUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    max_file_size_mb = await config_service.get_value("max_file_size_mb", db)
    max_bytes = max_file_size_mb * 1024 * 1024

    # Fetch URL content
    try:
        result = await url_service.fetch_url(body.url, max_size_bytes=max_bytes)
    except URLFetchError as e:
        raise HTTPException(status_code=400, detail=str(e))

    content: bytes = result["content"]
    filename: str = result["filename"]
    mime_type: str = result["mime_type"]
    is_webpage: bool = result["is_webpage"]

    ext = PurePosixPath(filename).suffix.lower()

    # Validate extension (web pages become .txt which is allowed)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non supporté : {ext}",
        )

    # Dedup check
    file_hash = hashlib.sha256(content).hexdigest()
    existing_result = await db.execute(
        select(Document).where(Document.file_hash == file_hash)
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return UploadResponse(
            documents=[],
            errors=[FileError(
                filename=filename,
                error=f"Fichier dupliqué : déjà téléversé sous le nom {existing.filename}",
            )],
        )

    # Upload to MinIO
    doc_id = uuid.uuid4()
    minio_key = f"{doc_id}/{filename}"
    await minio_service.upload_file("uploads", minio_key, content, mime_type)

    # Create DB record
    doc = Document(
        id=doc_id,
        filename=filename,
        original_extension=ext,
        mime_type=mime_type,
        file_size_bytes=len(content),
        file_hash=file_hash,
        minio_bucket="uploads",
        minio_key=minio_key,
        source_url=body.url,
        processing_status="uploaded",
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.flush()

    # Audit log
    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="document_uploaded",
        entity_type="document",
        entity_id=doc_id,
        details={
            "filename": filename,
            "size_bytes": len(content),
            "extension": ext,
            "source_url": body.url,
            "is_webpage": is_webpage,
        },
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

    # Dispatch processing task
    process_document.delay(str(doc_id))

    return UploadResponse(
        documents=[DocumentResponse.model_validate(doc)],
        errors=[],
    )
