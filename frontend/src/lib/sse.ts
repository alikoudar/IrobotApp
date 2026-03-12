import type { ChatSource } from "./types";

const API_BASE = "/api/v1";

interface StreamCallbacks {
  onMetadata?: (data: { conversation_id: string }) => void;
  onToken?: (token: string) => void;
  onSources?: (sources: ChatSource[]) => void;
  onTitle?: (title: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  documentIds: string[] | null,
  callbacks: StreamCallbacks,
  imageId?: string | null
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    conversation_id: conversationId,
    document_ids: documentIds,
  };
  if (imageId) {
    body.image_id = imageId;
  }

  const res = await fetch(API_BASE + "/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      callbacks.onError?.("Authentification requise");
      return;
    }
    const err = await res.json().catch(() => ({ detail: `Erreur ${res.status}` }));
    callbacks.onError?.(err.detail || `Erreur ${res.status}`);
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  function processLine(line: string) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
      return;
    }
    if (!line.startsWith("data: ")) return;

    const rawData = line.slice(6);
    if (!rawData) return;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      // not JSON
    }

    switch (currentEvent) {
      case "metadata":
        if (parsed && typeof parsed === "object" && "conversation_id" in (parsed as Record<string, unknown>)) {
          callbacks.onMetadata?.(parsed as { conversation_id: string });
        }
        break;
      case "sources":
        if (parsed) {
          const sources = Array.isArray(parsed)
            ? parsed
            : (parsed as Record<string, unknown>).sources || [];
          callbacks.onSources?.(sources as ChatSource[]);
        }
        break;
      case "title":
        if (parsed && typeof parsed === "object" && "title" in (parsed as Record<string, unknown>)) {
          callbacks.onTitle?.(String((parsed as Record<string, unknown>).title));
        }
        break;
      case "done":
        callbacks.onDone?.();
        break;
      case "token": {
        let token = "";
        if (parsed && typeof parsed === "object" && "content" in (parsed as Record<string, unknown>)) {
          token = String((parsed as Record<string, unknown>).content);
        } else if (typeof parsed === "string") {
          token = parsed;
        } else {
          token = rawData;
        }
        callbacks.onToken?.(token);
        break;
      }
    }

    currentEvent = "";
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      processLine(line);
    }
  }

  if (buffer.trim()) {
    buffer.split("\n").forEach((line) => processLine(line));
  }

  callbacks.onDone?.();
}
