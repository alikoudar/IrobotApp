"""Centralized Mistral API pricing registry.

All cost calculations go through this module. When a model is switched
via admin config, the next API call automatically picks up the correct rate.

Prices are per-token (USD). OCR is per-page (USD).
Batch OCR gets 50% discount (applied automatically).
"""

from decimal import Decimal

# ── Chat / completion models ────────────────────────────────────────
# model_id → (input_cost_per_token, output_cost_per_token)
CHAT_MODEL_PRICING: dict[str, tuple[Decimal, Decimal]] = {
    # Mistral Small 3.2
    "mistral-small-latest": (Decimal("0.0000001"), Decimal("0.0000003")),
    "mistral-small-3.2":    (Decimal("0.0000001"), Decimal("0.0000003")),
    # Mistral Medium 3
    "mistral-medium-latest": (Decimal("0.0000004"), Decimal("0.000002")),
    "mistral-medium-3":      (Decimal("0.0000004"), Decimal("0.000002")),
    # Mistral Large 3
    "mistral-large-latest": (Decimal("0.0000005"), Decimal("0.0000015")),
    "mistral-large-3":      (Decimal("0.0000005"), Decimal("0.0000015")),
}

# Fallback when model is not in the registry (conservative estimate)
_DEFAULT_CHAT_PRICING = (Decimal("0.0000005"), Decimal("0.0000015"))

# ── Embedding models ────────────────────────────────────────────────
# model_id → input_cost_per_token (embeddings have no output cost)
EMBED_MODEL_PRICING: dict[str, Decimal] = {
    "mistral-embed": Decimal("0.0000001"),
}

_DEFAULT_EMBED_PRICING = Decimal("0.0000001")

# ── OCR models ──────────────────────────────────────────────────────
# model_id → cost_per_page (already with 50% batch discount)
OCR_MODEL_PRICING: dict[str, Decimal] = {
    "mistral-ocr-latest": Decimal("0.001"),  # $2/1000pg, 50% batch = $0.001
}

_DEFAULT_OCR_PRICING = Decimal("0.001")


def get_chat_costs(model: str) -> tuple[Decimal, Decimal]:
    """Return (input_cost_per_token, output_cost_per_token) for a chat model."""
    return CHAT_MODEL_PRICING.get(model, _DEFAULT_CHAT_PRICING)


def get_embed_cost(model: str) -> Decimal:
    """Return input_cost_per_token for an embedding model."""
    return EMBED_MODEL_PRICING.get(model, _DEFAULT_EMBED_PRICING)


def get_ocr_cost(model: str) -> Decimal:
    """Return cost_per_page for an OCR model (batch-discounted)."""
    return OCR_MODEL_PRICING.get(model, _DEFAULT_OCR_PRICING)


def compute_chat_cost(
    model: str, input_tokens: int, output_tokens: int
) -> Decimal:
    """Compute total USD cost for a chat/completion call."""
    input_rate, output_rate = get_chat_costs(model)
    return (input_rate * input_tokens) + (output_rate * output_tokens)


def compute_embed_cost(model: str, total_tokens: int) -> Decimal:
    """Compute total USD cost for an embedding call."""
    return get_embed_cost(model) * total_tokens


def compute_ocr_cost(model: str, pages: int) -> Decimal:
    """Compute total USD cost for an OCR batch call."""
    return get_ocr_cost(model) * pages
