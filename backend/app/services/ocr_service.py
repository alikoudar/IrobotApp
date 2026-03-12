import asyncio
import base64
import json
import logging
import re

from mistralai import Mistral

from app.config import get_settings
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)

# Mime types for image upload to MinIO
IMAGE_CONTENT_TYPES = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
}


class OCRService:
    """Service for Mistral OCR batch processing."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client = Mistral(api_key=settings.mistral_api_key)
        self.minio_service = MinIOService()
        self._default_model = "mistral-ocr-latest"

    @property
    def model(self) -> str:
        return self._default_model

    def set_model(self, model: str) -> None:
        """Override the OCR model (called by tasks after reading config)."""
        self._default_model = model

    async def upload_documents_to_mistral(self, documents: list[dict]) -> dict[str, str]:
        """Upload documents from MinIO to Mistral Files API.

        Returns mapping of {doc_id: mistral_file_id}.
        """
        file_mapping: dict[str, str] = {}

        for doc in documents:
            doc_id = doc["id"]
            try:
                content = await self.minio_service.download_file(
                    doc["minio_bucket"], doc["minio_key"]
                )
                uploaded = await asyncio.to_thread(
                    self.client.files.upload,
                    file={
                        "file_name": doc["filename"],
                        "content": content,
                    },
                    purpose="ocr",
                )
                file_mapping[doc_id] = uploaded.id
                logger.info("Uploaded %s to Mistral Files → %s", doc["filename"], uploaded.id)
            except Exception:
                logger.exception(
                    "Erreur lors du téléversement vers le service OCR pour %s", doc_id
                )

        return file_mapping

    async def process_batch(self, documents: list[dict]) -> str:
        """Build JSONL, upload to Mistral, create batch job.

        Returns the batch job ID.
        """
        file_mapping = await self.upload_documents_to_mistral(documents)
        if not file_mapping:
            raise RuntimeError("Erreur lors du téléversement vers le service OCR")

        # Build JSONL
        lines = []
        for doc in documents:
            doc_id = doc["id"]
            if doc_id not in file_mapping:
                continue
            entry = {
                "custom_id": doc_id,
                "body": {
                    "model": self.model,
                    "document": {
                        "type": "file",
                        "file_id": file_mapping[doc_id],
                    },
                    "include_image_base64": True,
                    "table_format": "html",
                    "extract_header": True,
                    "extract_footer": True,
                },
            }
            lines.append(json.dumps(entry))

        jsonl_content = "\n".join(lines).encode("utf-8")

        # Upload JSONL as batch input
        jsonl_file = await asyncio.to_thread(
            self.client.files.upload,
            file={
                "file_name": "ocr_batch.jsonl",
                "content": jsonl_content,
            },
            purpose="batch",
        )
        logger.info("Uploaded batch JSONL → %s", jsonl_file.id)

        # Create batch job
        batch_job = await asyncio.to_thread(
            self.client.batch.jobs.create,
            input_files=[jsonl_file.id],
            endpoint="/v1/ocr",
            model=self.model,
        )
        logger.info("Created OCR batch job → %s", batch_job.id)
        return batch_job.id

    async def check_batch_status(self, job_id: str) -> dict:
        """Check the status of a batch job."""
        job = await asyncio.to_thread(
            self.client.batch.jobs.get, job_id=job_id
        )
        return {
            "status": job.status,
            "total_requests": job.total_requests,
            "completed_requests": getattr(job, "completed_requests", 0),
            "succeeded_requests": getattr(job, "succeeded_requests", 0),
            "failed_requests": getattr(job, "failed_requests", 0),
            "output_file": getattr(job, "output_file", None),
            "error_file": getattr(job, "error_file", None),
        }

    async def retrieve_batch_results(self, job_id: str) -> list[dict]:
        """Download and parse batch results, post-process each document."""
        job = await asyncio.to_thread(
            self.client.batch.jobs.get, job_id=job_id
        )

        # Download output file
        output_file_id = getattr(job, "output_file", None)
        if not output_file_id:
            raise RuntimeError("Lot OCR échoué : pas de fichier de sortie")

        content = await asyncio.to_thread(
            self.client.files.download, file_id=output_file_id
        )
        # content may be bytes or a response object
        if hasattr(content, "read"):
            raw_data = content.read()
        elif isinstance(content, bytes):
            raw_data = content
        else:
            raw_data = str(content).encode("utf-8")

        results = []
        for line in raw_data.decode("utf-8").strip().split("\n"):
            if not line.strip():
                continue
            entry = json.loads(line)
            doc_id = entry["custom_id"]
            response_body = entry.get("response", {}).get("body", entry.get("body", {}))

            # Post-process: extract images, fix refs, inline tables
            processed = await self._post_process_ocr_result(doc_id, response_body)

            usage_info = response_body.get("usage_info", {})
            results.append({
                "document_id": doc_id,
                "ocr_response": processed,
                "usage_info": usage_info,
                "model": response_body.get("model", self.model),
            })

        return results

    async def _post_process_ocr_result(self, document_id: str, ocr_data: dict) -> dict:
        """Process OCR output: extract images to MinIO, fix refs, inline tables."""
        pages = ocr_data.get("pages", [])

        for page in pages:
            page_index = page.get("index", 0)
            images = page.get("images", []) or []
            tables = page.get("tables", []) or []
            markdown = page.get("markdown", "")

            # Build table lookup: id → html content
            table_lookup = {}
            for table in tables:
                table_lookup[table["id"]] = table.get("content", "")

            # Process images: upload to MinIO, clear base64
            for img in images:
                img_id = img.get("id", "")
                img_b64 = img.get("image_base64")
                if img_b64:
                    try:
                        img_bytes = base64.b64decode(img_b64)
                        ext = "." + img_id.rsplit(".", 1)[-1] if "." in img_id else ".jpeg"
                        content_type = IMAGE_CONTENT_TYPES.get(ext, "image/jpeg")
                        minio_key = f"{document_id}/page-{page_index}/{img_id}"
                        await self.minio_service.upload_file(
                            "ocr-images", minio_key, img_bytes, content_type
                        )
                        logger.debug("Stored OCR image → ocr-images/%s", minio_key)
                    except Exception:
                        logger.exception("Failed to store image %s for doc %s", img_id, document_id)
                    img["image_base64"] = None

            # Fix image references in markdown
            for img in images:
                img_id = img.get("id", "")
                minio_ref = f"minio://ocr-images/{document_id}/page-{page_index}/{img_id}"
                # Replace ![img_id](img_id) with MinIO ref
                markdown = markdown.replace(
                    f"![{img_id}]({img_id})",
                    f"![{img_id}]({minio_ref})",
                )

            # Inline tables in markdown
            for table_id, table_html in table_lookup.items():
                # Replace [table_id](table_id) with actual HTML
                markdown = markdown.replace(
                    f"[{table_id}]({table_id})",
                    table_html,
                )

            page["markdown"] = markdown

        return ocr_data


ocr_service = OCRService()
