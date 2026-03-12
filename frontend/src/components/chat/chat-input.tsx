"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

interface ChatInputProps {
  onSend: (message: string, imageFile?: File) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function ChatInput({ onSend, disabled, autoFocus }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = (value.trim() || imageFile) && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim(), imageFile || undefined);
    setValue("");
    setImageFile(null);
    setImagePreview(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, imageFile, canSend, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setImageError("Seules les images (PNG, JPEG, WebP, GIF) sont acceptées.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setImageError("L'image dépasse la taille maximale de 5 Mo.");
      return;
    }

    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  return (
    <div className="border-t bg-background">
      {imageError && (
        <div className="px-3 pt-2">
          <p className="text-xs text-red-500">{imageError}</p>
        </div>
      )}
      {imagePreview && (
        <div className="px-3 pt-2">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Aperçu"
              className="h-20 w-20 object-cover rounded-lg border"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleImageSelect}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-beac-bleue"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Joindre une image"
        >
          <ImagePlus className="h-5 w-5" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question..."
          disabled={disabled}
          className="min-h-[40px] max-h-[120px] resize-none rounded-2xl"
          rows={1}
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full bg-beac-bleue hover:bg-beac-bleue-dark"
          onClick={handleSend}
          disabled={!canSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
