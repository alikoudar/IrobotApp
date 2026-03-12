"""RAG retrieval service — vector search with MinIO reference resolution."""

import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import Chunk, Document
from app.services.embedding_service import embedding_service
from app.services.minio_service import MinIOService

logger = logging.getLogger(__name__)

MINIO_REF_PATTERN = re.compile(r"minio://([^/\s)]+)/([^\s)]+)")


class RAGService:
    """Service for retrieval-augmented generation — pure vector search layer."""

    def __init__(self) -> None:
        self._minio = None

    def _get_minio(self) -> MinIOService:
        if self._minio is None:
            self._minio = MinIOService()
        return self._minio

    async def search(
        self,
        query: str,
        db: AsyncSession,
        top_k: int = 5,
        document_ids: list[str] | None = None,
        user_id: str | None = None,
    ) -> list[dict]:
        """Embed query, search pgvector, resolve MinIO refs, return ranked results."""
        # Embed the query
        embeddings = await embedding_service.embed_texts(
            [query], db, user_id=user_id
        )
        if not embeddings:
            return []

        query_embedding = embeddings[0]

        # pgvector cosine distance query
        distance = Chunk.embedding.cosine_distance(query_embedding)
        stmt = (
            select(
                Chunk,
                Document.filename,
                Document.category,
                distance.label("distance"),
            )
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.processing_status == "ready")
        )

        if document_ids:
            stmt = stmt.where(Document.id.in_(document_ids))

        stmt = stmt.order_by(distance).limit(top_k)

        result = await db.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        # Build results with resolved MinIO refs
        results = []
        for chunk, filename, category, dist in rows:
            content, metadata = await self._resolve_minio_refs(
                chunk.content, chunk.chunk_metadata or {}
            )
            results.append({
                "document_id": chunk.document_id,
                "chunk_id": chunk.id,
                "filename": filename,
                "category": category,
                "page_number": chunk.page_number,
                "content": content,
                "metadata": metadata,
                "score": 1.0 - float(dist),  # cosine similarity
            })

        logger.info(
            "RAG search: query=%r, results=%d, top_score=%.4f",
            query[:50], len(results),
            results[0]["score"] if results else 0,
        )
        return results

    async def _resolve_minio_refs(
        self, content: str, metadata: dict
    ) -> tuple[str, dict]:
        """Replace minio:// refs with presigned HTTP URLs."""
        minio = self._get_minio()

        # Resolve refs in content text
        matches = MINIO_REF_PATTERN.findall(content)
        for bucket, key in matches:
            try:
                url = await minio.get_presigned_url(bucket, key)
                content = content.replace(f"minio://{bucket}/{key}", url)
            except Exception as e:
                logger.warning("Failed to resolve minio://%s/%s: %s", bucket, key, e)

        # Resolve image_refs in metadata
        image_refs = metadata.get("image_refs", [])
        if image_refs:
            resolved_refs = []
            for ref in image_refs:
                if isinstance(ref, str) and ref.startswith("minio://"):
                    match = MINIO_REF_PATTERN.match(ref)
                    if match:
                        bucket, key = match.groups()
                        try:
                            url = await minio.get_presigned_url(bucket, key)
                            resolved_refs.append(url)
                        except Exception:
                            resolved_refs.append(ref)
                    else:
                        resolved_refs.append(ref)
                else:
                    resolved_refs.append(ref)
            metadata = {**metadata, "image_refs": resolved_refs}

        return content, metadata


rag_service = RAGService()
