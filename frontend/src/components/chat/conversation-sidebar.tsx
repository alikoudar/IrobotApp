"use client";

import { Plus, MessageSquare, Archive, ArchiveRestore, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ConversationPreview } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: ConversationPreview[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onArchive,
  onUnarchive,
  showArchived,
  onToggleArchived,
}: ConversationSidebarProps) {
  return (
    <div className="flex h-full w-[250px] shrink-0 flex-col border-r bg-background max-lg:hidden">
      <div className="p-3 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" />
          Nouvelle conversation
        </Button>
        <button
          onClick={onToggleArchived}
          className="flex items-center gap-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          <Archive className="h-3 w-3" />
          {showArchived ? "Voir les conversations" : "Voir les archives"}
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group relative flex items-center rounded-lg transition-colors hover:bg-secondary",
                conv.id === activeId && "bg-secondary font-medium"
              )}
            >
              <button
                onClick={() => onSelect(conv.id)}
                className="w-full text-left px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate pr-6">{conv.title}</span>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/10"
                  onClick={(e) => e.stopPropagation()}
                  render={<button />}
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {showArchived ? (
                    <DropdownMenuItem
                      onClick={() => onUnarchive(conv.id)}
                      className="gap-2"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      Désarchiver
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => onArchive(conv.id)}
                      className="gap-2"
                    >
                      <Archive className="h-4 w-4" />
                      Archiver
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      if (window.confirm("Supprimer cette conversation ?")) {
                        onDelete(conv.id);
                      }
                    }}
                    className="gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {showArchived ? "Aucune archive" : "Aucune conversation"}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
