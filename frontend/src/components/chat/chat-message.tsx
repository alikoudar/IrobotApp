"use client";

import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";
import { ChatSources } from "./chat-sources";
import { ChatFeedback } from "./chat-feedback";
import { AuthImage } from "./auth-image";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface ChatMessageProps {
  message: ChatMessageType;
  feedbackRating?: number | null;
  onFeedbackUpdate?: (messageId: string, rating: number) => void;
}

export function ChatMessage({ message, feedbackRating = null, onFeedbackUpdate }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-beac-or-light rounded-2xl rounded-br-sm"
            : "bg-beac-bleue-light rounded-2xl rounded-bl-sm",
          "max-lg:max-w-[95%]"
        )}
      >
        {isUser && message.imageUrl && (
          <AuthImage
            src={message.imageUrl}
            alt="Image envoyée"
            className="max-h-64 rounded-lg mb-2 cursor-pointer hover:opacity-90"
          />
        )}
        {isUser ? (
          message.content ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : null
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <div className="flex gap-1 py-1">
            <span className="typing-dot h-2 w-2 rounded-full bg-beac-bleue/50" />
            <span className="typing-dot h-2 w-2 rounded-full bg-beac-bleue/50" />
            <span className="typing-dot h-2 w-2 rounded-full bg-beac-bleue/50" />
          </div>
        )}
      </div>
      {!isUser && message.sources && message.sources.length > 0 && (
        <ChatSources sources={message.sources} />
      )}
      {!isUser && message.conversationId && message.id && message.content && (
        <ChatFeedback
          conversationId={message.conversationId}
          messageId={message.id}
          initialRating={feedbackRating}
          onRatingChange={onFeedbackUpdate}
        />
      )}
    </div>
  );
}
