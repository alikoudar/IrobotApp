"""VisionAgent — OCR + RAG + vision streaming for image analysis."""

import asyncio
import base64
import logging
import mimetypes
from collections.abc import AsyncGenerator
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import TokenUsage
from app.services import config_service
from app.services.agents._streaming import async_mistral_stream
from app.services.agents.prompts import (
    VISION_OCR_PROMPT,
    VISION_SYSTEM_PROMPT,
    HistoryMessage,
    PromptBuilder,
    chunks_to_prompt_format,
)
from app.services.agents.query_agent import StreamResult
from app.services.minio_service import MinIOService
from app.services.pricing import compute_chat_cost
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)


class VisionAgent:
    """Agent that analyzes images using OCR, RAG, and Mistral vision."""

    def __init__(self) -> None:
        self._client = None
        self._prompt_builder = PromptBuilder()

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            settings = get_settings()
            self._client = Mistral(api_key=settings.mistral_api_key)
        return self._client

    async def _ocr_image(
        self, data_url: str, db: AsyncSession, user_id: str | None = None
    ) -> str:
        """Extract text from image using Mistral Small vision (non-streaming)."""
        client = self._get_client()
        chat_model = await config_service.get_value("vision_model", db)

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": data_url},
                    {"type": "text", "text": VISION_OCR_PROMPT},
                ],
            }
        ]

        try:
            response = await asyncio.to_thread(
                client.chat.complete,
                model=chat_model,
                messages=messages,
                max_tokens=2000,
            )

            ocr_text = response.choices[0].message.content.strip()

            # Track token usage
            if response.usage:
                input_t = response.usage.prompt_tokens or 0
                output_t = response.usage.completion_tokens or 0
                usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
                cost_usd = compute_chat_cost(chat_model, input_t, output_t)
                cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
                db.add(TokenUsage(
                    user_id=user_id,
                    operation="vision_ocr",
                    model=chat_model,
                    input_tokens=input_t,
                    output_tokens=output_t,
                    estimated_cost_usd=cost_usd,
                    estimated_cost_xaf=cost_xaf,
                ))
                logger.info("Vision OCR: %d input, %d output tokens", input_t, output_t)

            return ocr_text

        except Exception as e:
            logger.error("Vision OCR error: %s", e)
            return ""

    async def stream(
        self,
        image_id: str,
        message: str,
        history: list[HistoryMessage],
        db: AsyncSession,
        result: StreamResult,
        user_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        model = await config_service.get_value("vision_model", db)
        max_tokens = await config_service.get_value("chat_max_tokens", db)
        client = self._get_client()

        # Step 1: Fetch image from MinIO -> base64 data URL
        minio = MinIOService()
        try:
            image_data = await minio.download_file("chat-images", image_id)
        except Exception as e:
            logger.error("Failed to download image %s: %s", image_id, e)
            error_msg = "Impossible de charger l'image. Veuillez réessayer."
            result.full_response = error_msg
            yield error_msg
            return

        mime_type, _ = mimetypes.guess_type(image_id)
        if not mime_type:
            mime_type = "image/png"
        b64 = base64.b64encode(image_data).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64}"

        # Step 2: OCR - extract text from image
        ocr_text = await self._ocr_image(data_url, db, user_id)

        # Step 3: RAG - search using OCR text + user message
        search_query = f"{message} {ocr_text}".strip() if message else ocr_text
        search_results = []
        if search_query and ocr_text and ocr_text != "Aucun texte détecté":
            try:
                search_results = await rag_service.search(
                    query=search_query, db=db, top_k=5, user_id=user_id,
                )
            except Exception as e:
                logger.error("Vision RAG search error: %s", e)

        # Build sources
        if search_results:
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

        # Step 4: Build multimodal prompt
        messages_list = [{"role": "system", "content": VISION_SYSTEM_PROMPT}]

        # Add history (truncated)
        for msg in history[-10:]:
            content = msg.content[:500] + "..." if len(msg.content) > 500 else msg.content
            messages_list.append({"role": msg.role, "content": content})

        # Build user message text
        text_parts = []
        if message:
            text_parts.append(f"Question de l'utilisateur : {message}")
        if ocr_text and ocr_text != "Aucun texte détecté":
            text_parts.append(f"\nTexte extrait de l'image (OCR) :\n{ocr_text}")
        if search_results:
            prompt_chunks = chunks_to_prompt_format(search_results)
            context = self._prompt_builder.build_context_section(prompt_chunks)
            if context:
                text_parts.append(f"\nContexte documentaire pertinent :\n{context}")
        if not message:
            text_parts.append("\nAnalyse cette image et décris ce que tu observes.")

        built_text = "\n".join(text_parts)

        user_content = [
            {"type": "image_url", "image_url": data_url},
            {"type": "text", "text": built_text},
        ]
        messages_list.append({"role": "user", "content": user_content})

        # Step 5: Stream final vision response
        try:
            async for event in async_mistral_stream(client, model, messages_list, max_tokens):
                data = event.data
                if data.choices and data.choices[0].delta.content:
                    token = data.choices[0].delta.content
                    result.full_response += token
                    yield token
                if data.usage:
                    result.input_tokens = data.usage.prompt_tokens or 0
                    result.output_tokens = data.usage.completion_tokens or 0
        except Exception as e:
            logger.error("Vision stream error: %s", e)
            error_msg = "Désolé, une erreur s'est produite lors de l'analyse de l'image."
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
                operation="vision",
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                estimated_cost_usd=cost_usd,
                estimated_cost_xaf=cost_xaf,
            ))
            logger.info("Vision: %d input, %d output tokens", result.input_tokens, result.output_tokens)
