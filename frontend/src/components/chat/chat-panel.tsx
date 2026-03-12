"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { fetchFeedback } from "@/lib/api-client";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  onSend: (message: string, imageFile?: File) => void;
}

export function ChatPanel({ messages, isStreaming, onSend }: ChatPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, number>>({});

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch all feedbacks for the conversation when conversationId changes
  const conversationId = messages.find((m) => m.conversationId)?.conversationId;
  useEffect(() => {
    if (!conversationId) {
      setFeedbackMap({});
      return;
    }
    fetchFeedback(conversationId)
      .then((data) => setFeedbackMap(data.feedbacks || {}))
      .catch(() => {});
  }, [conversationId]);

  const handleFeedbackUpdate = (messageId: string, rating: number) => {
    setFeedbackMap((prev) => ({ ...prev, [messageId]: rating }));
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 min-w-0">
      <ScrollArea className="flex-1 min-h-0 p-4" viewportRef={viewportRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <h2 className="text-xl font-semibold text-beac-bleue mb-2">
              Bienvenue
            </h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Posez une question sur vos documents ou téléversez-en de nouveaux.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                feedbackRating={feedbackMap[msg.id] ?? null}
                onFeedbackUpdate={handleFeedbackUpdate}
              />
            ))}

          </div>
        )}
      </ScrollArea>
      <ChatInput onSend={onSend} disabled={isStreaming} autoFocus />
    </div>
  );
}
