import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Document
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)


class TextService:
    """Service for extracting text from txt/rtf files."""

    def __init__(self) -> None:
        self.minio_service = MinIOService()

    async def extract_text(self, document_id: str, db: AsyncSession) -> str:
        """Extract text from a txt or rtf file.

        Downloads from MinIO, extracts text content, updates status to
        'chunking' (skips OCR).
        """
        result = await db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise ValueError(f"Document {document_id} introuvable")

        try:
            content_bytes = await self.minio_service.download_file(
                doc.minio_bucket, doc.minio_key
            )

            ext = doc.original_extension.lower()

            if ext == ".txt":
                text = self._decode_text(content_bytes)
            elif ext == ".rtf":
                text = self._extract_rtf(content_bytes)
            else:
                doc.processing_status = "failed"
                doc.error_message = f"Extension non supportée pour l'extraction de texte : {ext}"
                await db.flush()
                raise ValueError(f"Unsupported extension for text extraction: {ext}")

            doc.processing_status = "chunking"
            await db.flush()

            logger.info(
                "Extracted text from %s (%d chars)", doc.filename, len(text)
            )
            return text

        except Exception:
            if doc.processing_status not in ("failed",):
                doc.processing_status = "failed"
                doc.error_message = "Erreur lors de l'extraction du texte"
                await db.flush()
            raise

    def _decode_text(self, data: bytes) -> str:
        """Decode text bytes with UTF-8, falling back to latin-1."""
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return data.decode("latin-1")

    def _extract_rtf(self, data: bytes) -> str:
        """Extract text from RTF content using striprtf."""
        from striprtf.striprtf import rtf_to_text

        raw = self._decode_text(data)
        return rtf_to_text(raw)


    async def extract_text_content(self, bucket: str, key: str, ext: str) -> str:
        """Extract text content from a file without touching the database.

        Stateless method for use during chunking.
        """
        content_bytes = await self.minio_service.download_file(bucket, key)
        ext = ext.lower()

        if ext == ".txt":
            return self._decode_text(content_bytes)
        elif ext == ".rtf":
            return self._extract_rtf(content_bytes)
        else:
            raise ValueError(f"Unsupported extension for text extraction: {ext}")


text_service = TextService()
