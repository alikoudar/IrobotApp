"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChatSource } from "@/lib/types";

interface ChatSourcesProps {
  sources: ChatSource[];
}

export function ChatSources({ sources }: ChatSourcesProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1 ml-1 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-beac-bleue font-medium hover:underline"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Sources consultées ({sources.length})
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-black/[0.03] p-2 space-y-1">
          {sources.map((s, i) => (
            <div key={i} className="text-muted-foreground">
              <span className="font-medium text-foreground">{s.filename}</span>
              {s.page_number && <span> — p.{s.page_number}</span>}
              {s.score != null && <span> ({Math.round(s.score * 100)}%)</span>}
              {s.snippet && (
                <p className="mt-0.5 text-[0.7rem] italic truncate">
                  {s.snippet.substring(0, 120)}...
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
