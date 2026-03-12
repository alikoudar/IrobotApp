"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { FileUploader } from "./file-uploader";
import { UrlUploader } from "./url-uploader";
import { DocumentFilters } from "./document-filters";
import { DocumentTable } from "./document-table";
import { useDocuments } from "@/hooks/use-documents";
import { useAuth } from "@/hooks/use-auth";

export function DocumentsPage() {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [uploadedBy, setUploadedBy] = useState("");
  const { role } = useAuth();
  const canUpload = role === "admin" || role === "manager";

  const { data, isLoading } = useDocuments({
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
    uploaded_by: uploadedBy || undefined,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-beac-bleue">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data?.total ?? 0} document(s) au total
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-beac-rouge/30 bg-beac-rouge/5 p-4">
        <AlertTriangle className="h-5 w-5 text-beac-rouge shrink-0 mt-0.5" />
        <p className="text-sm text-beac-rouge">
          Attention : Il est interdit de telecharger des documents contenant des mots de passe, des identifiants, des donnees personnelles ou toute information confidentielle.
        </p>
      </div>

      {canUpload && (
        <div className="grid gap-4 md:grid-cols-2">
          <FileUploader />
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium mb-2">Ou importez depuis une URL</p>
            <UrlUploader />
          </div>
        </div>
      )}

      <DocumentFilters
        status={status}
        category={category}
        uploadedBy={uploadedBy}
        onStatusChange={setStatus}
        onCategoryChange={setCategory}
        onUploadedByChange={setUploadedBy}
      />

      <div className="rounded-lg border bg-background">
        <DocumentTable
          documents={data?.documents || []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
