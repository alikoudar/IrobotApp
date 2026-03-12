"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UploadWarningDialog } from "./upload-warning-dialog";

export function UrlUploader() {
  const [url, setUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const doUpload = async (targetUrl: string) => {
    setIsUploading(true);
    try {
      const data = await uploadUrl(targetUrl);
      setUrl("");
      if (data.documents?.length) {
        toast.success("URL téléversée avec succès");
      }
      if (data.errors?.length) {
        data.errors.forEach((err) => toast.error(err.error));
      }
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du téléversement");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPendingUrl(trimmed);
  };

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="https://exemple.com/document.pdf"
          disabled={isUploading}
        />
        <Button
          onClick={handleSubmit}
          disabled={!url.trim() || isUploading}
          className="bg-beac-bleue hover:bg-beac-bleue-dark shrink-0"
        >
          <Send className="h-4 w-4 mr-2" />
          Envoyer
        </Button>
      </div>
      <UploadWarningDialog
        open={!!pendingUrl}
        onOpenChange={(open) => { if (!open) setPendingUrl(null); }}
        onConfirm={() => {
          if (pendingUrl) {
            doUpload(pendingUrl);
            setPendingUrl(null);
          }
        }}
      />
    </>
  );
}
