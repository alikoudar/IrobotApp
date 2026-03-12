"""OrchestratorAgent — classifies intent, routes to agents, manages conversation."""

import asyncio
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import ChatMessage, Conversation, TokenUsage
from app.services import config_service
from app.services.audit_service import AuditService
from app.models.schemas import ChatRequest
from app.services.agents.greeting_agent import GreetingAgent
from app.services.agents.prompts import (
    CLASSIFICATION_SYSTEM_PROMPT,
    CLASSIFICATION_USER_TEMPLATE,
    SENSITIVE_REFUSAL_RESPONSE,
    HistoryMessage,
    is_sensitive_query,
    messages_to_history_format,
)
from app.services.agents.query_agent import QueryAgent, StreamResult
from app.services.agents.vision_agent import VisionAgent
from app.services.pricing import compute_chat_cost

logger = logging.getLogger(__name__)


class OrchestratorAgent:
    """Classifies user intent and routes to the appropriate agent."""

    def __init__(self) -> None:
        self._client = None
        self._greeting_agent = GreetingAgent()
        self._query_agent = QueryAgent()
        self._vision_agent = VisionAgent()
        self._audit_service = AuditService()

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            settings = get_settings()
            self._client = Mistral(api_key=settings.mistral_api_key)
        return self._client

    async def _classify(self, message: str, db: AsyncSession, user_id: str | None = None) -> str:
        """Classify user intent as 'greeting' or 'query'."""
        chat_model = await config_service.get_value("chat_model", db)
        usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
        client = self._get_client()

        messages = [
            {"role": "system", "content": CLASSIFICATION_SYSTEM_PROMPT},
            {"role": "user", "content": CLASSIFICATION_USER_TEMPLATE.format(message=message)},
        ]

        try:
            response = await asyncio.to_thread(
                client.chat.complete,
                model=chat_model,
                messages=messages,
                max_tokens=20,
            )

            result_text = response.choices[0].message.content.strip().lower()

            # Track classification tokens
            if response.usage:
                input_t = response.usage.prompt_tokens or 0
                output_t = response.usage.completion_tokens or 0
                cost_usd = compute_chat_cost(chat_model, input_t, output_t)
                cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
                db.add(TokenUsage(
                    user_id=user_id,
                    operation="classify",
                    model=chat_model,
                    input_tokens=input_t,
                    output_tokens=output_t,
                    estimated_cost_usd=cost_usd,
                    estimated_cost_xaf=cost_xaf,
                ))

            if "greeting" in result_text:
                return "greeting"
            return "query"

        except Exception as e:
            logger.error("Classification error: %s", e)
            return "query"  # safe default

    async def _load_history(
        self, conversation_id: str, db: AsyncSession, max_messages: int = 10
    ) -> list[HistoryMessage]:
        """Load recent messages for a conversation."""
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == uuid.UUID(conversation_id))
            .order_by(ChatMessage.created_at.desc())
            .limit(max_messages)
        )
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
        rows.reverse()  # chronological order
        return [HistoryMessage(role=r.role, content=r.content) for r in rows]

    async def _generate_title(
        self, message: str, db: AsyncSession, user_id: str | None = None
    ) -> str | None:
        """Generate a short conversation title."""
        chat_model = await config_service.get_value("chat_model", db)
        usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
        client = self._get_client()
        from app.services.agents.prompts import TITLE_SYSTEM_PROMPT, TITLE_USER_TEMPLATE

        messages = [
            {"role": "system", "content": TITLE_SYSTEM_PROMPT},
            {"role": "user", "content": TITLE_USER_TEMPLATE.format(message=message)},
        ]

        try:
            response = await asyncio.to_thread(
                client.chat.complete,
                model=chat_model,
                messages=messages,
                max_tokens=30,
            )
            title = response.choices[0].message.content.strip()

            if response.usage:
                input_t = response.usage.prompt_tokens or 0
                output_t = response.usage.completion_tokens or 0
                cost_usd = compute_chat_cost(chat_model, input_t, output_t)
                cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
                db.add(TokenUsage(
                    user_id=user_id,
                    operation="title_gen",
                    model=chat_model,
                    input_tokens=input_t,
                    output_tokens=output_t,
                    estimated_cost_usd=cost_usd,
                    estimated_cost_xaf=cost_xaf,
                ))

            return title
        except Exception as e:
            logger.error("Title generation error: %s", e)
            return None

    async def handle(
        self, request: ChatRequest, db: AsyncSession, user_id: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Main entry point. Yields SSE event dicts."""
        # Resolve conversation_id
        conversation_id = request.conversation_id or str(uuid.uuid4())
        is_new_conversation = request.conversation_id is None

        # Manage conversation record
        user_uuid = uuid.UUID(user_id) if user_id else None
        if is_new_conversation:
            conv = Conversation(
                id=uuid.UUID(conversation_id),
                user_id=user_uuid,
            )
            db.add(conv)
        else:
            conv = await db.get(Conversation, uuid.UUID(conversation_id))
            if conv:
                conv.updated_at = datetime.utcnow()

        # Load history
        history: list[HistoryMessage] = []
        if not is_new_conversation:
            history = await self._load_history(conversation_id, db)

        # Validate: require at least message or image_id
        if not request.message.strip() and not request.image_id:
            yield {"event": "metadata", "data": {
                "conversation_id": conversation_id,
                "agent": "error",
            }}
            yield {"event": "token", "data": {
                "content": "Veuillez envoyer un message ou une image."
            }}
            yield {"event": "done", "data": {}}
            return

        # Route to VisionAgent if image_id is present
        if request.image_id:
            agent_type = "vision"
            yield {"event": "metadata", "data": {
                "conversation_id": conversation_id,
                "agent": agent_type,
            }}

            full_response = ""
            sources: list[dict] = []

            try:
                stream_result = StreamResult()
                async for token in self._vision_agent.stream(
                    image_id=request.image_id,
                    message=request.message,
                    history=history,
                    db=db,
                    result=stream_result,
                    user_id=user_id,
                ):
                    yield {"event": "token", "data": {"content": token}}
                full_response = stream_result.full_response
                sources = stream_result.sources

                if sources:
                    yield {"event": "sources", "data": {"sources": sources}}

            except Exception as e:
                logger.error("Vision streaming error: %s", e)
                error_msg = "Une erreur s'est produite lors de l'analyse de l'image."
                full_response = error_msg
                yield {"event": "token", "data": {"content": error_msg}}

        # Layer 1: Keyword pre-filter for sensitive queries (no LLM call)
        elif is_sensitive_query(request.message):
            agent_type = "sensitive_block"
            yield {"event": "metadata", "data": {
                "conversation_id": conversation_id,
                "agent": agent_type,
            }}
            full_response = SENSITIVE_REFUSAL_RESPONSE
            sources: list[dict] = []
            yield {"event": "token", "data": {"content": full_response}}
        else:
            # Classify intent
            agent_type = await self._classify(request.message, db, user_id)

            # Emit metadata
            yield {"event": "metadata", "data": {
                "conversation_id": conversation_id,
                "agent": agent_type,
            }}

            full_response = ""
            sources: list[dict] = []

            try:
                if agent_type == "greeting":
                    async for token in self._greeting_agent.stream(
                        request.message, history, db, user_id
                    ):
                        full_response += token
                        yield {"event": "token", "data": {"content": token}}
                else:
                    stream_result = StreamResult()
                    async for token in self._query_agent.stream(
                        request.message, history, db, stream_result,
                        document_ids=request.document_ids, user_id=user_id,
                    ):
                        yield {"event": "token", "data": {"content": token}}
                    full_response = stream_result.full_response
                    sources = stream_result.sources

                    if sources:
                        yield {"event": "sources", "data": {"sources": sources}}

            except Exception as e:
                logger.error("Orchestrator streaming error: %s", e)
                error_msg = "Une erreur s'est produite. Veuillez réessayer."
                full_response = error_msg
                yield {"event": "token", "data": {"content": error_msg}}

        # Store messages before done event so title is available when frontend fetches
        try:
            # User message
            db.add(ChatMessage(
                conversation_id=uuid.UUID(conversation_id),
                user_id=user_uuid,
                role="user",
                content=request.message or "",
                image_url=request.image_id,
                agent_type=agent_type,
            ))
            # Assistant message
            db.add(ChatMessage(
                conversation_id=uuid.UUID(conversation_id),
                user_id=user_uuid,
                role="assistant",
                content=full_response,
                agent_type=agent_type,
                sources=sources,
            ))

            # Audit log
            await self._audit_service.log(
                db=db,
                user_id=user_id,
                action="chat_query",
                entity_type="conversation",
                entity_id=uuid.UUID(conversation_id),
                details={
                    "agent_type": agent_type,
                    "message_length": len(request.message),
                    "response_length": len(full_response),
                    "sources_count": len(sources),
                },
            )

            # Generate title for new conversations
            generated_title: str | None = None
            if is_new_conversation:
                title_input = request.message if request.message.strip() else None
                if title_input:
                    title = await self._generate_title(title_input, db, user_id)
                    if title:
                        title = title.strip().strip('"\'').strip()
                        generated_title = title
                    else:
                        generated_title = title_input[:30].strip()
                        if len(title_input) > 30:
                            generated_title += "…"
                else:
                    generated_title = "Analyse d'image"
                conv.title = generated_title

            await db.commit()

            # Emit title event for new conversations (after commit)
            if is_new_conversation and generated_title:
                yield {"event": "title", "data": {"title": generated_title}}

        except Exception as e:
            logger.error("Error storing chat messages: %s", e)
            await db.rollback()

        yield {"event": "done", "data": {}}


orchestrator_agent = OrchestratorAgent()
