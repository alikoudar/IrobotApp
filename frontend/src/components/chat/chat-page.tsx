"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/hooks/use-chat";
import { ConversationSidebar } from "./conversation-sidebar";
import { ChatPanel } from "./chat-panel";

export function ChatPage() {
  const {
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
  } = useChat();

  const autoLoadedRef = useRef(false);

  useEffect(() => {
    if (conversationsLoaded && conversations.length > 0 && !autoLoadedRef.current && !conversationId) {
      autoLoadedRef.current = true;
      loadConversation(conversations[0].id);
    }
  }, [conversationsLoaded, conversations, conversationId, loadConversation]);

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeId={conversationId}
        onNew={newConversation}
        onSelect={loadConversation}
        onDelete={deleteConv}
        onArchive={archiveConv}
        onUnarchive={unarchiveConv}
        showArchived={showArchived}
        onToggleArchived={toggleShowArchived}
      />
      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        onSend={send}
      />
    </div>
  );
}
