"""GreetingAgent — handles greetings, introductions, and identity questions."""

import logging
from collections.abc import AsyncGenerator
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.database import TokenUsage
from app.services import config_service
from app.services.agents._streaming import async_mistral_stream
from app.services.agents.prompts import GREETING_SYSTEM_PROMPT, HistoryMessage
from app.services.pricing import compute_chat_cost

logger = logging.getLogger(__name__)


class GreetingAgent:
    """Agent that responds to greetings and identity questions."""

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        if self._client is None:
            from mistralai import Mistral
            settings = get_settings()
            self._client = Mistral(api_key=settings.mistral_api_key)
        return self._client

    async def stream(
        self,
        message: str,
        history: list[HistoryMessage],
        db: AsyncSession,
        user_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        model = await config_service.get_value("chat_model", db)
        max_tokens = await config_service.get_value("chat_max_tokens", db)
        client = self._get_client()

        messages = [{"role": "system", "content": GREETING_SYSTEM_PROMPT}]
        for msg in history[-10:]:
            content = msg.content[:500] + "…" if len(msg.content) > 500 else msg.content
            messages.append({"role": msg.role, "content": content})
        messages.append({"role": "user", "content": message})

        input_tokens = 0
        output_tokens = 0

        try:
            async for event in async_mistral_stream(client, model, messages, max_tokens):
                data = event.data
                if data.choices and data.choices[0].delta.content:
                    yield data.choices[0].delta.content
                if data.usage:
                    input_tokens = data.usage.prompt_tokens or 0
                    output_tokens = data.usage.completion_tokens or 0
        except Exception as e:
            logger.error("Greeting stream error: %s", e)
            yield "Désolé, une erreur s'est produite. Veuillez réessayer."
            return

        # Track token usage
        if input_tokens or output_tokens:
            usd_to_xaf = await config_service.get_value("usd_to_xaf_rate", db)
            cost_usd = compute_chat_cost(model, input_tokens, output_tokens)
            cost_xaf = cost_usd * Decimal(str(usd_to_xaf))
            db.add(TokenUsage(
                user_id=user_id,
                operation="chat",
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost_usd=cost_usd,
                estimated_cost_xaf=cost_xaf,
            ))
            logger.info("Greeting: %d input, %d output tokens", input_tokens, output_tokens)
