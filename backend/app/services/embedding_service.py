import asyncio
import logging
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import TokenUsage
from app.services import config_service
from app.services.pricing import compute_embed_cost

logger = logging.getLogger(__name__)

BATCH_SIZE = 16


class EmbeddingService:
    """Service for generating embeddings via Mistral."""

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            settings = get_settings()
            self._client = Mistral(api_key=settings.mistral_api_key)
        return self._client

    async def embed_texts(
        self,
        texts: list[str],
        db: AsyncSession,
        document_id: str | None = None,
        user_id: str | None = None,
    ) -> list[list[float]]:
        """Generate embeddings for a list of texts in batches.

        Logs token usage to the database. Does NOT commit — caller handles that.
        """
        if not texts:
            return []

        model = await config_service.get_value("embedding_model", db)
        client = self._get_client()

        all_embeddings: list[list[float]] = []
        total_tokens = 0

        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]

            response = await asyncio.to_thread(
                client.embeddings.create,
                model=model,
                inputs=batch,
            )

            # Extract embeddings in order
            for item in response.data:
                all_embeddings.append(item.embedding)

            # Track tokens
            if response.usage:
                total_tokens += response.usage.total_tokens

        # Log token usage
        if total_tokens > 0:
            usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
            cost_usd = compute_embed_cost(model, total_tokens)
            cost_xaf = cost_usd * Decimal(str(usd_to_xaf))

            token_entry = TokenUsage(
                user_id=user_id,
                operation="embed",
                model=model,
                input_tokens=total_tokens,
                output_tokens=0,
                estimated_cost_usd=cost_usd,
                estimated_cost_xaf=cost_xaf,
                document_id=document_id,
            )
            db.add(token_entry)

        logger.info(
            "Embedded %d texts (%d tokens, model=%s)",
            len(texts), total_tokens, model,
        )

        return all_embeddings


embedding_service = EmbeddingService()
