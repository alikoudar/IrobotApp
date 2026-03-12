import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Regex to find minio:// image references in markdown
IMAGE_REF_RE = re.compile(r"!\[([^\]]*)\]\((minio://[^)]+)\)")

# Regex to match HTML table blocks
TABLE_BLOCK_RE = re.compile(r"<table[\s\S]*?</table>", re.IGNORECASE)

# Regex to match markdown pipe tables (header + separator + rows)
MD_TABLE_RE = re.compile(
    r"((?:^\|.+\|[ \t]*\n)+(?:\|.+\|[ \t]*$))",
    re.MULTILINE,
)


@dataclass
class ChunkData:
    content: str
    page_number: int | None
    chunk_index: int
    token_count: int
    metadata: dict = field(default_factory=dict)


def _estimate_tokens(text: str) -> int:
    """Estimate token count (~4 chars per token for Mistral)."""
    return len(text) // 4


class ChunkingService:
    """Service for splitting text into chunks with table preservation."""

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200,
        page_number: int | None = None,
        base_metadata: dict | None = None,
    ) -> list[ChunkData]:
        """Split plain text into overlapping chunks.

        Preserves HTML table blocks as atomic units.
        """
        if not text or not text.strip():
            return []

        # Protect table blocks from being split
        tables: list[str] = []
        placeholder_tpl = "\x00TABLE_{}\x00"

        def _replace_table(match: re.Match) -> str:
            idx = len(tables)
            tables.append(match.group(0))
            return placeholder_tpl.format(idx)

        protected = TABLE_BLOCK_RE.sub(_replace_table, text)
        # Also protect markdown pipe tables
        protected = MD_TABLE_RE.sub(_replace_table, protected)

        # Recursive split
        char_budget = chunk_size * 4  # convert token budget to char budget
        overlap_chars = overlap * 4

        raw_chunks = self._recursive_split(protected, char_budget)

        # Build chunks with overlap
        chunks: list[ChunkData] = []
        for i, raw in enumerate(raw_chunks):
            # Prepend overlap from previous chunk
            if i > 0 and overlap_chars > 0:
                prev = raw_chunks[i - 1]
                overlap_text = prev[-overlap_chars:]
                raw = overlap_text + raw

            # Restore table placeholders
            for idx, tbl in enumerate(tables):
                raw = raw.replace(placeholder_tpl.format(idx), tbl)

            raw = raw.strip()
            if not raw:
                continue

            # Extract image refs from this chunk
            image_refs = IMAGE_REF_RE.findall(raw)
            meta = dict(base_metadata) if base_metadata else {}
            if image_refs:
                meta["image_refs"] = [{"alt": alt, "url": url} for alt, url in image_refs]

            chunks.append(ChunkData(
                content=raw,
                page_number=page_number,
                chunk_index=len(chunks),
                token_count=_estimate_tokens(raw),
                metadata=meta,
            ))

        return chunks

    def chunk_ocr_result(
        self,
        raw_response: dict,
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> list[ChunkData]:
        """Chunk OCR result pages, preserving page-level metadata."""
        pages = raw_response.get("pages", [])
        if not pages:
            return []

        all_chunks: list[ChunkData] = []
        global_index = 0

        for page in pages:
            page_num = page.get("index", 0)
            markdown = page.get("markdown", "")
            if not markdown or not markdown.strip():
                continue

            # Build page metadata
            page_meta: dict = {}
            if page.get("header"):
                page_meta["header"] = page["header"]
            if page.get("footer"):
                page_meta["footer"] = page["footer"]

            page_chunks = self.chunk_text(
                text=markdown,
                chunk_size=chunk_size,
                overlap=overlap,
                page_number=page_num,
                base_metadata=page_meta,
            )

            # Re-index globally
            for chunk in page_chunks:
                chunk.chunk_index = global_index
                global_index += 1

            all_chunks.extend(page_chunks)

        return all_chunks

    def _recursive_split(self, text: str, max_chars: int) -> list[str]:
        """Recursively split text using hierarchy of separators.

        Table placeholders (\\x00TABLE_N\\x00) are never split even if they
        exceed max_chars — tables must stay atomic.
        """
        if len(text) <= max_chars:
            return [text] if text.strip() else []

        # If the text is a single table placeholder, keep it whole
        if text.strip().startswith("\x00TABLE_") and text.strip().endswith("\x00"):
            return [text]

        separators = ["\n\n", "\n", ". ", " "]

        for sep in separators:
            parts = text.split(sep)
            if len(parts) == 1:
                continue

            chunks: list[str] = []
            current = ""

            for part in parts:
                candidate = current + sep + part if current else part
                if len(candidate) <= max_chars:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    # If single part exceeds budget but is a table placeholder, keep whole
                    if len(part) > max_chars:
                        stripped = part.strip()
                        if stripped.startswith("\x00TABLE_") and stripped.endswith("\x00"):
                            chunks.append(part)
                            current = ""
                        else:
                            sub = self._recursive_split(part, max_chars)
                            chunks.extend(sub)
                            current = ""
                    else:
                        current = part

            if current:
                chunks.append(current)

            if chunks:
                return chunks

        # Hard char split as last resort
        return [text[i:i + max_chars] for i in range(0, len(text), max_chars)]


chunking_service = ChunkingService()
