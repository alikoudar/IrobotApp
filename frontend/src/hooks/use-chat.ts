"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { streamChat } from "@/lib/sse";
import {
  fetchConversationHistory,
  fetchConversations,
  archiveConversation,
  deleteConversation,
  uploadChatImage,
} from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import type { ChatMessage, ChatSource, ConversationPreview } from "@/lib/types";

export function useChat() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const accumulatedRef = useRef("");
  const rafRef = useRef<number | null>(null);

  // Load conversations after auth is ready
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    (async () => {
      try {
        const data = await fetchConversations({ is_archived: showArchived });
        const previews: ConversationPreview[] = data.conversations.map((c) => ({
          id: c.id,
          title: c.title || "Sans titre",
          lastMessage: c.last_message || "",
          createdAt: c.created_at,
          isArchived: c.is_archived ?? false,
        }));
        setConversations(previews);
        setConversationsLoaded(true);
      } catch {
        setConversationsLoaded(true);
      }
    })();
  }, [authLoading, isAuthenticated, showArchived]);

  const toggleShowArchived = useCallback(() => {
    setShowArchived((prev) => !prev);
  }, []);

  const archiveConv = useCallback(
    async (id: string) => {
      try {
        await archiveConversation(id, true);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          setConversationId(null);
          setMessages([]);
        }
      } catch {
        // silently fail
      }
    },
    [conversationId]
  );

  const unarchiveConv = useCallback(
    async (id: string) => {
      try {
        await archiveConversation(id, false);
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch {
        // silently fail
      }
    },
    []
  );

  const deleteConv = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          setConversationId(null);
          setMessages([]);
        }
      } catch {
        // silently fail
      }
    },
    [conversationId]
  );

  const send = useCallback(
    async (message: string, imageFile?: File) => {
      if (isStreaming || (!message.trim() && !imageFile)) return;

      setIsStreaming(true);
      accumulatedRef.current = "";

      // Upload image if provided
      let imageId: string | null = null;
      let imageUrl: string | undefined;
      if (imageFile) {
        try {
          const uploadResult = await uploadChatImage(imageFile);
          imageId = uploadResult.image_id;
          imageUrl = uploadResult.image_url;
        } catch {
          setIsStreaming(false);
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        imageUrl,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      let currentConversationId = conversationId;
      let sources: ChatSource[] | undefined;
      const isNewConv = conversationId === null;

      await streamChat(message, conversationId, null, {
        onMetadata: (data) => {
          currentConversationId = data.conversation_id;
          setConversationId(data.conversation_id);
        },
        onToken: (token) => {
          accumulatedRef.current += token;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              const content = accumulatedRef.current;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content,
                };
                return updated;
              });
              rafRef.current = null;
            });
          }
        },
        onSources: (s) => {
          sources = s;
        },
        onTitle: (title) => {
          // Immediately add/update conversation in sidebar
          if (currentConversationId) {
            setConversations((prev) => {
              const exists = prev.some((c) => c.id === currentConversationId);
              if (exists) {
                return prev.map((c) =>
                  c.id === currentConversationId ? { ...c, title } : c
                );
              }
              return [
                {
                  id: currentConversationId!,
                  title,
                  lastMessage: message,
                  createdAt: new Date().toISOString(),
                  isArchived: false,
                },
                ...prev,
              ];
            });
          }
        },
        onDone: () => {
          const finalContent = accumulatedRef.current;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: finalContent,
              sources,
              conversationId: currentConversationId || undefined,
            };
            return updated;
          });

          // Refresh conversations list after chat completes
          fetchConversations({ is_archived: showArchived })
            .then((data) => {
              setConversations(
                data.conversations.map((c) => ({
                  id: c.id,
                  title: c.title || "Sans titre",
                  lastMessage: c.last_message || "",
                  createdAt: c.created_at,
                  isArchived: c.is_archived ?? false,
                }))
              );
            })
            .catch(() => {});

          setIsStreaming(false);
        },
        onError: (error) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: `Erreur : ${error}`,
            };
            return updated;
          });
          setIsStreaming(false);
        },
      }, imageId);
    },
    [conversationId, isStreaming, showArchived]
  );

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const data = await fetchConversationHistory(convId);
      setConversationId(convId);
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          imageUrl: m.image_url || undefined,
          sources: m.sources as unknown as ChatSource[],
          conversationId: m.conversation_id,
        }))
      );
    } catch {
      // silently fail
    }
  }, []);

  return {
    messages,
    conversationId,
    isStreaming,
    conversations,
    conversationsLoaded,
    send,
    newConversation,
    loadConversation,
    showArchived,
    toggleShowArchived,
    archiveConv,
    unarchiveConv,
    deleteConv,
  };
}
