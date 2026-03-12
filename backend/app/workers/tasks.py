import asyncio
import logging
import time
import uuid
from decimal import Decimal

import redis
from sqlalchemy import select, update

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

TEXT_EXTENSIONS = {".txt", ".rtf"}
OFFICE_EXTENSIONS = {".docx", ".xlsx", ".pptx"}
OCR_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

MAX_POLL_DELAY = 120  # seconds


def _create_task_session():
    """Create a fresh async engine + session for Celery workers.

    Each asyncio.run() creates a new event loop, so we need a fresh
    engine not bound to the module-level loop.
    """
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.config import get_settings

    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_factory, engine


async def _process_document_async(document_id: str) -> None:
    """Route document to appropriate processing service based on file type."""
    from app.models.database import Document
    from app.services.converter_service import converter_service
    from app.services.text_service import text_service

    session_factory, engine = _create_task_session()
    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error("Document %s introuvable", document_id)
                return

            ext = doc.original_extension.lower()
            logger.info("Processing document %s (%s, ext=%s)", doc.filename, document_id, ext)

            try:
                if ext in TEXT_EXTENSIONS:
                    await text_service.extract_text(document_id, db)
                elif ext in OFFICE_EXTENSIONS:
                    doc.processing_status = "converting"
                    await db.flush()
                    await db.commit()
                    await converter_service.convert_to_pdf(document_id, db)
                elif ext in OCR_EXTENSIONS:
                    doc.processing_status = "ocr_pending"
                    await db.flush()
                else:
                    doc.processing_status = "failed"
                    doc.error_message = f"Type de fichier non supporté : {ext}"
                    await db.flush()

                await db.commit()
                logger.info("Document %s processed → status=%s", document_id, doc.processing_status)

                # Trigger next step based on status
                if doc.processing_status == "ocr_pending":
                    try:
                        run_ocr_batch.delay()
                    except Exception:
                        logger.warning("Failed to trigger run_ocr_batch for doc %s; beat will pick it up", document_id)

                elif doc.processing_status == "chunking":
                    try:
                        chunk_and_embed.delay(document_id)
                    except Exception:
                        logger.warning("Failed to trigger chunk_and_embed for doc %s; sweep will pick it up", document_id)

            except Exception as e:
                logger.exception("Error processing document %s: %s", document_id, e)
                if doc.processing_status != "failed":
                    doc.processing_status = "failed"
                    doc.error_message = f"Erreur inattendue : {e}"
                    await db.flush()
                await db.commit()
    finally:
        await engine.dispose()


def _get_redis_client():
    """Get a Redis client for distributed locking."""
    import os
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    return redis.from_url(redis_url)


async def _run_ocr_batch_async() -> None:
    """Collect ocr_pending documents and submit a Mistral OCR batch."""
    from app.models.database import Document
    from app.services.ocr_service import ocr_service
    from app.services import config_service

    # Acquire Redis lock to prevent concurrent batch submissions
    r = _get_redis_client()
    lock_acquired = r.set("ocr_batch_lock", "1", nx=True, ex=30)
    if not lock_acquired:
        logger.info("OCR batch lock held by another worker, skipping")
        return

    session_factory, engine = _create_task_session()
    try:
        async with session_factory() as db:
            # Select pending documents with row lock to prevent races
            result = await db.execute(
                select(Document)
                .where(Document.processing_status == "ocr_pending")
                .order_by(Document.created_at)
                .limit(100)
                .with_for_update(skip_locked=True)
            )
            docs = list(result.scalars().all())

            if not docs:
                logger.info("No documents pending OCR")
                return

            # Read OCR model from config
            ocr_model = await config_service.get_value("ocr_model", db)
            if ocr_model:
                ocr_service.set_model(ocr_model)

            doc_list = [
                {
                    "id": str(doc.id),
                    "minio_bucket": doc.minio_bucket,
                    "minio_key": doc.minio_key,
                    "filename": doc.filename,
                }
                for doc in docs
            ]

            logger.info("Submitting OCR batch for %d documents", len(doc_list))

            try:
                job_id = await ocr_service.process_batch(doc_list)
            except Exception as e:
                logger.exception("Erreur lors de la création du lot OCR: %s", e)
                for doc in docs:
                    doc.processing_status = "failed"
                    doc.error_message = "Erreur lors de la création du lot OCR"
                await db.commit()
                return

            # Update all docs to ocr_processing
            for doc in docs:
                doc.processing_status = "ocr_processing"
                doc.ocr_job_id = job_id
            await db.commit()

            logger.info("OCR batch submitted → job_id=%s, docs=%d", job_id, len(docs))

            # Audit log
            from app.services.audit_service import AuditService
            audit_svc = AuditService()
            await audit_svc.log(
                db=db,
                user_id=None,
                action="batch_started",
                entity_type="ocr_batch",
                details={
                    "job_id": job_id,
                    "document_count": len(docs),
                    "document_ids": [str(d.id) for d in docs],
                },
            )
            await db.commit()

            # Schedule polling
            poll_ocr_batch.apply_async(
                args=[job_id],
                kwargs={"attempt": 0, "start_time": time.time()},
                countdown=10,
            )
    finally:
        await engine.dispose()


async def _poll_ocr_batch_async(job_id: str, attempt: int = 0, start_time: float | None = None) -> None:
    """Poll a Mistral OCR batch job and process results when complete."""
    from app.models.database import Document, OCRResult, TokenUsage
    from app.services.ocr_service import ocr_service

    if start_time is None:
        start_time = time.time()

    elapsed = time.time() - start_time

    session_factory, engine = _create_task_session()
    try:
        # Load batch timeout from config
        from app.services import config_service
        async with session_factory() as _db:
            batch_timeout_minutes = await config_service.get_value("batch_timeout_minutes", _db)
        batch_timeout_seconds = (batch_timeout_minutes or 30) * 60

        # Check timeout
        if elapsed > batch_timeout_seconds:
            logger.error("OCR batch %s timed out after %.0fs", job_id, elapsed)
            async with session_factory() as db:
                await db.execute(
                    update(Document)
                    .where(Document.ocr_job_id == job_id)
                    .values(
                        processing_status="failed",
                        error_message=f"Délai d'attente OCR dépassé ({batch_timeout_minutes} min)",
                    )
                )
                from app.services.audit_service import AuditService
                await AuditService().log(
                    db=db,
                    user_id=None,
                    action="ocr_failed",
                    entity_type="ocr_batch",
                    details={"job_id": job_id, "reason": "timeout", "elapsed_seconds": elapsed},
                )
                await db.commit()
            return

        # Check status
        try:
            status_info = await ocr_service.check_batch_status(job_id)
        except Exception as e:
            logger.exception("Error checking batch %s status: %s", job_id, e)
            # Retry with backoff
            delay = min(10 * (2 ** attempt), MAX_POLL_DELAY)
            poll_ocr_batch.apply_async(
                args=[job_id],
                kwargs={"attempt": attempt + 1, "start_time": start_time},
                countdown=delay,
            )
            return

        status = status_info["status"]
        logger.info(
            "OCR batch %s: status=%s, completed=%s/%s",
            job_id, status,
            status_info.get("succeeded_requests", "?"),
            status_info.get("total_requests", "?"),
        )

        if status in ("QUEUED", "RUNNING"):
            delay = min(10 * (2 ** attempt), MAX_POLL_DELAY)
            poll_ocr_batch.apply_async(
                args=[job_id],
                kwargs={"attempt": attempt + 1, "start_time": start_time},
                countdown=delay,
            )
            return

        if status in ("FAILED", "TIMEOUT_EXCEEDED", "CANCELLED", "CANCELLATION_REQUESTED"):
            logger.error("OCR batch %s failed with status: %s", job_id, status)
            async with session_factory() as db:
                await db.execute(
                    update(Document)
                    .where(Document.ocr_job_id == job_id)
                    .values(
                        processing_status="failed",
                        error_message=f"Lot OCR échoué : {status}",
                    )
                )
                from app.services.audit_service import AuditService
                await AuditService().log(
                    db=db,
                    user_id=None,
                    action="ocr_failed",
                    entity_type="ocr_batch",
                    details={"job_id": job_id, "status": status},
                )
                await db.commit()
            return

        # SUCCESS — retrieve and store results
        if status == "SUCCESS":
            try:
                results = await ocr_service.retrieve_batch_results(job_id)
            except Exception as e:
                logger.exception("Error retrieving batch %s results: %s", job_id, e)
                async with session_factory() as db:
                    await db.execute(
                        update(Document)
                        .where(Document.ocr_job_id == job_id)
                        .values(
                            processing_status="failed",
                            error_message="Erreur lors de la récupération des résultats OCR",
                        )
                    )
                    await db.commit()
                return

            # Collect doc IDs that reach chunking status
            docs_to_chunk: list[str] = []

            async with session_factory() as db:
                for res in results:
                    doc_id = res["document_id"]
                    ocr_response = res["ocr_response"]
                    usage_info = res["usage_info"]
                    model = res["model"]

                    # Get document
                    doc_result = await db.execute(
                        select(Document).where(Document.id == doc_id)
                    )
                    doc = doc_result.scalar_one_or_none()
                    if not doc:
                        logger.warning("Document introuvable pour le traitement OCR: %s", doc_id)
                        continue

                    # Create OCR result
                    page_count = len(ocr_response.get("pages", []))
                    ocr_result = OCRResult(
                        document_id=doc.id,
                        raw_response=ocr_response,
                        model=model,
                        document_annotation=ocr_response.get("document_annotation"),
                        usage_info=usage_info,
                    )
                    db.add(ocr_result)

                    # Update document
                    doc.processing_status = "chunking"
                    doc.page_count = page_count

                    # Log token usage with cost
                    pages_processed = usage_info.get("pages_processed", page_count)
                    from app.services.pricing import compute_ocr_cost
                    cost_usd = compute_ocr_cost(model, pages_processed)
                    # Load XAF rate from config
                    from app.services import config_service
                    usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db) or 655
                    cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
                    token_entry = TokenUsage(
                        operation="ocr",
                        model=model,
                        input_tokens=pages_processed,
                        output_tokens=0,
                        estimated_cost_usd=cost_usd,
                        estimated_cost_xaf=cost_xaf,
                        document_id=doc.id,
                    )
                    db.add(token_entry)

                    docs_to_chunk.append(str(doc.id))

                    logger.info(
                        "OCR result stored for doc %s: %d pages", doc_id, page_count
                    )

                # Audit log per document
                from app.services.audit_service import AuditService
                audit_svc = AuditService()
                for res in results:
                    await audit_svc.log(
                        db=db,
                        user_id=None,
                        action="ocr_completed",
                        entity_type="document",
                        entity_id=uuid.UUID(res["document_id"]) if isinstance(res["document_id"], str) else res["document_id"],
                        details={
                            "job_id": job_id,
                            "page_count": len(res["ocr_response"].get("pages", [])),
                            "model": res["model"],
                        },
                    )

                await db.commit()
                logger.info("OCR batch %s fully processed (%d results)", job_id, len(results))

            # Trigger chunking for each document
            for doc_id in docs_to_chunk:
                try:
                    chunk_and_embed.delay(doc_id)
                except Exception:
                    logger.warning("Failed to trigger chunk_and_embed for doc %s; sweep will pick it up", doc_id)
        else:
            # Unknown status — retry
            logger.warning("OCR batch %s unknown status: %s", job_id, status)
            delay = min(10 * (2 ** attempt), MAX_POLL_DELAY)
            poll_ocr_batch.apply_async(
                args=[job_id],
                kwargs={"attempt": attempt + 1, "start_time": start_time},
                countdown=delay,
            )
    finally:
        await engine.dispose()


async def _chunk_and_embed_async(document_id: str) -> None:
    """Chunk document content and generate embeddings."""
    from app.models.database import Chunk, Document, OCRResult
    from app.services.chunking_service import chunking_service
    from app.services.embedding_service import embedding_service
    from app.services.text_service import text_service
    from app.services import config_service

    session_factory, engine = _create_task_session()

    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error("Document %s introuvable pour le chunking", document_id)
                return

            if doc.processing_status != "chunking":
                logger.warning(
                    "Document %s has status '%s', expected 'chunking'. Skipping.",
                    document_id, doc.processing_status,
                )
                return

            try:
                # Delete any existing chunks (idempotent retry)
                from sqlalchemy import delete
                await db.execute(
                    delete(Chunk).where(Chunk.document_id == doc.id)
                )
                await db.flush()

                ext = doc.original_extension.lower()

                # Read chunk config from DB
                chunk_size = await config_service.get_value("chunk_size", db)
                chunk_overlap = await config_service.get_value("chunk_overlap", db)

                # Get chunks based on file type
                if ext in TEXT_EXTENSIONS:
                    # Re-extract text (stateless)
                    text = await text_service.extract_text_content(
                        doc.minio_bucket, doc.minio_key, ext
                    )
                    chunk_data_list = chunking_service.chunk_text(
                        text,
                        chunk_size=chunk_size,
                        overlap=chunk_overlap,
                    )
                    ocr_result_id = None
                else:
                    # Load latest OCR result
                    ocr_result = await db.execute(
                        select(OCRResult)
                        .where(OCRResult.document_id == doc.id)
                        .order_by(OCRResult.created_at.desc())
                        .limit(1)
                    )
                    ocr_res = ocr_result.scalar_one_or_none()
                    if not ocr_res:
                        raise ValueError(f"Résultat OCR introuvable pour le document {document_id}")

                    ocr_result_id = ocr_res.id
                    chunk_data_list = chunking_service.chunk_ocr_result(
                        ocr_res.raw_response,
                        chunk_size=chunk_size,
                        overlap=chunk_overlap,
                    )

                if not chunk_data_list:
                    logger.warning("No chunks produced for document %s", document_id)
                    doc.processing_status = "ready"
                    await db.commit()
                    return

                # Update status to embedding
                doc.processing_status = "embedding"
                await db.flush()
                await db.commit()

                logger.info(
                    "Document %s: %d chunks produced, generating embeddings",
                    document_id, len(chunk_data_list),
                )

                # Generate embeddings
                texts = [c.content for c in chunk_data_list]
                embeddings = await embedding_service.embed_texts(
                    texts, db, document_id=document_id,
                )

                # Create Chunk rows
                for chunk_data, embedding in zip(chunk_data_list, embeddings):
                    chunk = Chunk(
                        document_id=doc.id,
                        ocr_result_id=ocr_result_id,
                        content=chunk_data.content,
                        page_number=chunk_data.page_number,
                        chunk_index=chunk_data.chunk_index,
                        token_count=chunk_data.token_count,
                        embedding=embedding,
                        chunk_metadata=chunk_data.metadata,
                    )
                    db.add(chunk)

                doc.processing_status = "ready"
                await db.commit()

                logger.info(
                    "Document %s: chunking + embedding complete → ready (%d chunks)",
                    document_id, len(chunk_data_list),
                )

            except Exception as e:
                logger.exception("Error during chunk_and_embed for doc %s: %s", document_id, e)
                doc.processing_status = "failed"
                doc.error_message = f"Erreur lors du découpage/embedding : {e}"
                await db.commit()
    finally:
        await engine.dispose()


async def _sweep_chunking_pending_async() -> None:
    """Find documents stuck in 'chunking' status and re-trigger processing."""
    from app.models.database import Document

    session_factory, engine = _create_task_session()
    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Document)
                .where(Document.processing_status == "chunking")
                .order_by(Document.created_at)
                .limit(50)
            )
            docs = list(result.scalars().all())

            if not docs:
                return

            logger.info("Sweep found %d documents stuck in 'chunking'", len(docs))
            for doc in docs:
                try:
                    chunk_and_embed.delay(str(doc.id))
                except Exception:
                    logger.warning("Failed to trigger chunk_and_embed sweep for doc %s", doc.id)
    finally:
        await engine.dispose()


@celery_app.task(name="process_document")
def process_document(document_id: str) -> None:
    """Process a document through the ingestion pipeline."""
    asyncio.run(_process_document_async(document_id))


@celery_app.task(name="run_ocr_batch")
def run_ocr_batch() -> None:
    """Collect pending documents and submit OCR batch."""
    asyncio.run(_run_ocr_batch_async())


@celery_app.task(name="poll_ocr_batch", bind=True, max_retries=0)
def poll_ocr_batch(self, job_id: str, attempt: int = 0, start_time: float | None = None) -> None:
    """Poll Mistral batch job status."""
    asyncio.run(_poll_ocr_batch_async(job_id, attempt, start_time))


@celery_app.task(name="chunk_and_embed")
def chunk_and_embed(document_id: str) -> None:
    """Chunk document content and generate embeddings."""
    asyncio.run(_chunk_and_embed_async(document_id))


@celery_app.task(name="sweep_chunking_pending")
def sweep_chunking_pending() -> None:
    """Sweep for documents stuck in chunking status."""
    asyncio.run(_sweep_chunking_pending_async())


async def _archive_old_audit_logs_async() -> None:
    """Archive audit logs older than 24h to MinIO."""
    from datetime import datetime, timedelta
    from app.services.audit_service import AuditService
    from app.services.minio_service import MinIOService

    session_factory, engine = _create_task_session()
    try:
        async with session_factory() as db:
            audit_svc = AuditService()
            minio_svc = MinIOService()
            date_before = datetime.utcnow() - timedelta(hours=24)
            result = await audit_svc.archive_logs(db, minio_svc, date_before)
            if result["archived_count"] > 0:
                await db.commit()
                logger.info("Auto-archived %d audit logs to %s", result["archived_count"], result["file_key"])
            else:
                logger.debug("No audit logs to auto-archive")
    finally:
        await engine.dispose()


@celery_app.task(name="archive_old_audit_logs")
def archive_old_audit_logs() -> None:
    """Archive audit logs older than 24h."""
    asyncio.run(_archive_old_audit_logs_async())
