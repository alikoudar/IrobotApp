import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup


# MIME types that should be treated as downloadable files (not web pages)
FILE_MIME_PREFIXES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "image/",
}

EXTENSION_MAP = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/tiff": ".tiff",
    "image/bmp": ".bmp",
    "image/webp": ".webp",
}


def _is_file_mime(mime: str) -> bool:
    """Check if MIME type represents a downloadable file (not a web page)."""
    for prefix in FILE_MIME_PREFIXES:
        if mime.startswith(prefix):
            return True
    return False


def _filename_from_url(url: str, mime_type: str) -> str:
    """Derive a filename from URL path or fallback to domain."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")

    if path and path != "/":
        name = path.split("/")[-1]
        # Clean up query params from name
        name = re.sub(r"[?#].*", "", name)
        if name and "." in name:
            return name

    # Fallback: domain-based name
    domain = parsed.hostname or "page"
    domain = domain.replace("www.", "")
    ext = EXTENSION_MAP.get(mime_type, ".txt")
    return f"{domain}{ext}"


class URLService:
    """Service for fetching and processing URL content."""

    async def fetch_url(self, url: str, max_size_bytes: int = 10 * 1024 * 1024) -> dict:
        """
        Fetch content from a URL.

        Returns dict with keys:
            - content: bytes
            - mime_type: str
            - filename: str
            - is_webpage: bool
        """
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=30.0,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
        except httpx.TimeoutException:
            raise URLFetchError("Délai d'attente dépassé lors du téléchargement de l'URL")
        except httpx.HTTPStatusError as e:
            raise URLFetchError(
                f"L'URL a renvoyé une erreur HTTP {e.response.status_code}"
            )
        except httpx.RequestError:
            raise URLFetchError("Impossible de se connecter à l'URL fournie")

        content = response.content

        if len(content) > max_size_bytes:
            raise URLFetchError(
                f"Le contenu de l'URL dépasse la taille maximale de {max_size_bytes // (1024 * 1024)}MB"
            )

        # Detect MIME type from Content-Type header
        content_type = response.headers.get("content-type", "")
        mime_type = content_type.split(";")[0].strip().lower() if content_type else ""

        if not mime_type or mime_type == "application/octet-stream":
            # Fallback: try python-magic
            try:
                import magic
                mime_type = magic.from_buffer(content, mime=True)
            except Exception:
                mime_type = "application/octet-stream"

        # Determine if this is a file or a web page
        is_webpage = mime_type.startswith("text/html")

        if is_webpage:
            # Extract text from HTML
            soup = BeautifulSoup(content, "html.parser")
            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            # Clean up excessive blank lines
            text = re.sub(r"\n{3,}", "\n\n", text)
            content = text.encode("utf-8")
            mime_type = "text/plain"

        filename = _filename_from_url(url, mime_type)
        if is_webpage and not filename.endswith(".txt"):
            filename = filename.rsplit(".", 1)[0] + ".txt" if "." in filename else filename + ".txt"

        return {
            "content": content,
            "mime_type": mime_type,
            "filename": filename,
            "is_webpage": is_webpage,
        }


class URLFetchError(Exception):
    """Raised when URL fetching fails."""
    pass
