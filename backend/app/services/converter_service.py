import asyncio
import logging
import tempfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Document
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)

# Class-level lock: LibreOffice is not thread-safe
_libreoffice_lock = asyncio.Lock()


class ConverterService:
    """Service for converting Office documents to PDF via LibreOffice."""

    def __init__(self) -> None:
        self.minio_service = MinIOService()

    async def convert_to_pdf(self, document_id: str, db: AsyncSession) -> str:
        """Convert an Office document (docx/xlsx/pptx) to PDF.

        Downloads from MinIO, converts via LibreOffice, uploads PDF to
        processed bucket, and updates document status.
        """
        result = await db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise ValueError(f"Document {document_id} introuvable")

        tmp_dir = None
        try:
            # Download from MinIO
            content = await self.minio_service.download_file(
                doc.minio_bucket, doc.minio_key
            )

            # Write to temp directory
            tmp_dir = tempfile.mkdtemp()
            input_path = Path(tmp_dir) / doc.filename
            input_path.write_bytes(content)

            # Run LibreOffice with lock (not thread-safe)
            async with _libreoffice_lock:
                process = await asyncio.create_subprocess_exec(
                    "libreoffice",
                    "--headless",
                    "--convert-to", "pdf",
                    "--outdir", tmp_dir,
                    str(input_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=120
                )

            if process.returncode != 0:
                error_msg = stderr.decode(errors="replace").strip()
                logger.error("LibreOffice conversion failed: %s", error_msg)
                doc.processing_status = "failed"
                doc.error_message = "Échec de la conversion en PDF"
                await db.flush()
                raise RuntimeError(f"LibreOffice failed: {error_msg}")

            # Find the output PDF
            pdf_name = input_path.stem + ".pdf"
            pdf_path = Path(tmp_dir) / pdf_name

            if not pdf_path.exists():
                doc.processing_status = "failed"
                doc.error_message = "Fichier PDF de sortie introuvable après conversion"
                await db.flush()
                raise FileNotFoundError(f"PDF output not found: {pdf_path}")

            pdf_content = pdf_path.read_bytes()

            # Upload to MinIO processed bucket
            minio_key = f"{document_id}/{pdf_name}"
            await self.minio_service.upload_file(
                "processed", minio_key, pdf_content, "application/pdf"
            )

            # Update document record
            doc.minio_bucket = "processed"
            doc.minio_key = minio_key
            doc.processing_status = "ocr_pending"
            await db.flush()

            logger.info(
                "Converted %s to PDF → processed/%s", doc.filename, minio_key
            )
            return minio_key

        except (asyncio.TimeoutError,):
            doc.processing_status = "failed"
            doc.error_message = "Délai de conversion dépassé (120s)"
            await db.flush()
            raise

        except Exception:
            # If status not already set to failed, set it now
            if doc.processing_status not in ("failed",):
                doc.processing_status = "failed"
                doc.error_message = "Erreur inattendue lors de la conversion"
                await db.flush()
            raise

        finally:
            # Cleanup temp files
            if tmp_dir:
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)


converter_service = ConverterService()
