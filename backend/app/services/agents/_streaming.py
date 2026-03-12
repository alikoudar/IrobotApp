"""Shared utility to iterate a sync Mistral stream from async context."""

import asyncio
from collections.abc import AsyncGenerator


async def async_mistral_stream(client, model: str, messages: list, max_tokens: int) -> AsyncGenerator:
    """Run sync Mistral chat.stream() in a thread, yield events via asyncio.Queue."""
    queue: asyncio.Queue = asyncio.Queue()

    def _run():
        try:
            for event in client.chat.stream(
                model=model, messages=messages, max_tokens=max_tokens
            ):
                queue.put_nowait(event)
        except Exception as e:
            queue.put_nowait(e)
        queue.put_nowait(None)  # sentinel

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _run)

    while True:
        event = await queue.get()
        if event is None:
            break
        if isinstance(event, Exception):
            raise event
        yield event
