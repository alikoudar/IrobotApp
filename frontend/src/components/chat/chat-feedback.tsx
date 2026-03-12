"use client";

import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendFeedback } from "@/lib/api-client";
import { toast } from "sonner";

interface ChatFeedbackProps {
  conversationId: string;
  messageId: string;
  initialRating?: number | null;
  onRatingChange?: (messageId: string, rating: number) => void;
}

export function ChatFeedback({ conversationId, messageId, initialRating = null, onRatingChange }: ChatFeedbackProps) {
  const [selected, setSelected] = useState<number | null>(initialRating);

  useEffect(() => {
    setSelected(initialRating);
  }, [initialRating]);

  const handleFeedback = async (rating: number) => {
    setSelected(rating);
    onRatingChange?.(messageId, rating);
    try {
      await sendFeedback(conversationId, messageId, rating);
      toast.success("Merci pour votre retour");
    } catch {
      toast.error("Erreur lors de l'envoi du retour");
    }
  };

  return (
    <div className="mt-1 ml-1 flex gap-1">
      <Button
        variant="outline"
        size="icon"
        className={`h-7 w-7 rounded-full ${selected === 1 ? "bg-beac-bleue text-white border-beac-bleue" : ""}`}
        onClick={() => handleFeedback(1)}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={`h-7 w-7 rounded-full ${selected === -1 ? "bg-beac-bleue text-white border-beac-bleue" : ""}`}
        onClick={() => handleFeedback(-1)}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
