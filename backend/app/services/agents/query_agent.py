"""QueryAgent — RAG retrieval + streaming LLM response with source attribution."""

import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import TokenUsage
from app.services import config_service
from app.services.agents._streaming import async_mistral_stream
from app.services.agents.prompts import (
    NO_CONTEXT_RESPONSE,
    RERANK_SYSTEM_PROMPT,
    RERANK_USER_TEMPLATE,
    HistoryMessage,
    PromptBuilder,
    chunks_to_prompt_format,
)
from app.services.pricing import compute_chat_cost
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)


@dataclass
class StreamResult:
    """Mutable container to collect streaming results."""
    sources: list[dict] = field(default_factory=list)
    full_response: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


class QueryAgent:
    """Agent that performs RAG retrieval and streams LLM answers."""

    def __init__(self) -> None:
        self._client = None
        self._prompt_builder = PromptBuilder()

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            settings = get_settings()
            self._client = Mistral(api_key=settings.mistral_api_key)
        return self._client

    async def _rerank(
        self,
        question: str,
        search_results: list[dict],
        db: AsyncSession,
        rerank_model: str,
        rerank_top_k: int,
        user_id: str | None = None,
    ) -> list[dict]:
        """Rerank search results using LLM scoring."""
        client = self._get_client()

        # Build passages text (up to 3000 chars each so table rows are visible)
        passages_text = ""
        for i, r in enumerate(search_results, 1):
            snippet = r["content"][:3000] if r["content"] else ""
            passages_text += f"[{i}] {snippet}\n\n"

        messages = [
            {"role": "system", "content": RERANK_SYSTEM_PROMPT},
            {"role": "user", "content": RERANK_USER_TEMPLATE.format(
                question=question, passages=passages_text,
            )},
        ]

        try:
            response = await client.chat.complete_async(
                model=rerank_model,
                messages=messages,
                max_tokens=256,
                temperature=0.0,
                response_format={"type": "json_object"},
            )

            # Track token usage
            input_tokens = response.usage.prompt_tokens or 0
            output_tokens = response.usage.completion_tokens or 0
            if input_tokens or output_tokens:
                usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
                cost_usd = compute_chat_cost(rerank_model, input_tokens, output_tokens)
                cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
                db.add(TokenUsage(
                    user_id=user_id,
                    operation="rerank",
                    model=rerank_model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost_usd=cost_usd,
                    estimated_cost_xaf=cost_xaf,
                ))
                logger.info("Rerank: %d input, %d output tokens", input_tokens, output_tokens)

            # Parse scores
            content = response.choices[0].message.content
            data = json.loads(content)
            scores = data.get("scores", [])

            if len(scores) != len(search_results):
                logger.warning("Rerank score count mismatch: got %d, expected %d", len(scores), len(search_results))
                return search_results[:rerank_top_k]

            # Attach scores and sort
            scored = list(zip(scores, search_results))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [r for _, r in scored[:rerank_top_k]]

        except Exception as e:
            logger.error("Rerank failed, falling back to original order: %s", e)
            return search_results[:rerank_top_k]

    async def stream(
        self,
        message: str,
        history: list[HistoryMessage],
        db: AsyncSession,
        result: StreamResult,
        document_ids: list[str] | None = None,
        user_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        model = await config_service.get_value("chat_model", db)
        max_tokens = await config_service.get_value("chat_max_tokens", db)
        top_k = await config_service.get_value("rag_top_k", db)
        client = self._get_client()

        # Fetch more chunks for table-related queries (tables may be split)
        _TABLE_KEYWORDS = [
            "salaire", "catégorie", "categorie", "tableau", "montant",
            "grille", "échelon", "echelon", "classe", "indice", "barème",
            "bareme", "prime", "rémunération", "remuneration",
        ]
        query_lower = message.lower()
        is_table_query = any(kw in query_lower for kw in _TABLE_KEYWORDS)
        initial_top_k = 20 if is_table_query else 10

        # Retrieve relevant chunks
        search_results = await rag_service.search(
            query=message, db=db, top_k=initial_top_k,
            document_ids=document_ids, user_id=user_id,
        )

        # Reranking
        rerank_enabled = await config_service.get_value("rerank_enabled", db)
        if rerank_enabled and search_results:
            rerank_model = await config_service.get_value("rerank_model", db)
            rerank_top_k = await config_service.get_value("rerank_top_k", db)
            search_results = await self._rerank(
                question=message,
                search_results=search_results,
                db=db,
                rerank_model=rerank_model,
                rerank_top_k=rerank_top_k,
                user_id=user_id,
            )
        elif search_results:
            search_results = search_results[:top_k]

        if not search_results:
            result.sources = []
            result.full_response = NO_CONTEXT_RESPONSE
            yield NO_CONTEXT_RESPONSE
            return

        # Build sources for response
        result.sources = [
            {
                "document_id": str(r["document_id"]),
                "filename": r["filename"],
                "category": r.get("category"),
                "page_number": r.get("page_number"),
                "score": round(r.get("score", 0.0), 4),
                "snippet": r["content"][:200] if r["content"] else None,
            }
            for r in search_results
        ]

        # Build prompt
        prompt_chunks = chunks_to_prompt_format(search_results)
        history_msgs = history if history else None
        messages = self._prompt_builder.build_full_prompt(
            query=message, chunks=prompt_chunks, history=history_msgs,
        )

        try:
            async for event in async_mistral_stream(client, model, messages, max_tokens):
                data = event.data
                if data.choices and data.choices[0].delta.content:
                    token = data.choices[0].delta.content
                    result.full_response += token
                    yield token
                if data.usage:
                    result.input_tokens = data.usage.prompt_tokens or 0
                    result.output_tokens = data.usage.completion_tokens or 0
        except Exception as e:
            logger.error("Query stream error: %s", e)
            error_msg = "Désolé, une erreur s'est produite lors de la génération de la réponse."
            result.full_response += error_msg
            yield error_msg
            return

        # Track token usage
        if result.input_tokens or result.output_tokens:
            usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
            cost_usd = compute_chat_cost(model, result.input_tokens, result.output_tokens)
            cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
            db.add(TokenUsage(
                user_id=user_id,
                operation="chat",
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                estimated_cost_usd=cost_usd,
                estimated_cost_xaf=cost_xaf,
            ))
            logger.info("Query: %d input, %d output tokens", result.input_tokens, result.output_tokens)
