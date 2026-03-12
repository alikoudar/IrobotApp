"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_FILES, MAX_FILE_SIZE_MB } from "@/lib/constants";
import { uploadFiles } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UploadWarningDialog } from "./upload-warning-dialog";

export function FileUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const doUpload = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      try {
        const data = await uploadFiles(files);
        if (data.documents?.length) {
          toast.success(`${data.documents.length} fichier(s) téléversé(s)`);
        }
        if (data.errors?.length) {
          data.errors.forEach((err) => toast.error(`${err.filename} : ${err.error}`));
        }
        queryClient.invalidateQueries({ queryKey: ["documents"] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors du téléversement");
      } finally {
        setIsUploading(false);
      }
    },
    [queryClient]
  );

  const validateAndUpload = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length > MAX_UPLOAD_FILES) {
        toast.error(`Maximum ${MAX_UPLOAD_FILES} fichiers par envoi`);
        return;
      }
      for (const f of files) {
        const ext = "." + f.name.split(".").pop()!.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          toast.error(`Extension non autorisée : ${ext}`);
          return;
        }
        if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error(`Fichier trop volumineux : ${f.name}`);
          return;
        }
      }

      setPendingFiles(files);
    },
    []
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) validateAndUpload(e.dataTransfer.files);
  };

  return (
    <>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          isDragging ? "border-beac-bleue bg-beac-bleue-light" : "border-border hover:border-beac-bleue hover:bg-beac-bleue-light/50",
          isUploading && "opacity-50 pointer-events-none"
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          {isUploading ? "Téléversement en cours..." : "Glissez vos fichiers ici ou cliquez"}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Max {MAX_UPLOAD_FILES} fichiers, {MAX_FILE_SIZE_MB} Mo chacun
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={(e) => {
            if (e.target.files?.length) validateAndUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <UploadWarningDialog
        open={!!pendingFiles}
        onOpenChange={(open) => { if (!open) setPendingFiles(null); }}
        onConfirm={() => {
          if (pendingFiles) {
            doUpload(pendingFiles);
            setPendingFiles(null);
          }
        }}
      />
    </>
  );
}
