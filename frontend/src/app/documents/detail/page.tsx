"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/documents/status-badge";
import { fetchDocumentDetail, fetchDocumentChunks } from "@/lib/api-client";
import { formatDate, formatFileSize } from "@/lib/utils";

function DocumentDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const { data: doc, isLoading: docLoading, isError: docError } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocumentDetail(id!),
    enabled: !!id,
    retry: 1,
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery({
    queryKey: ["document-chunks", id],
    queryFn: () => fetchDocumentChunks(id!),
    enabled: !!id && !!doc,
    retry: 1,
  });

  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const toggleChunk = (index: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Aucun document sélectionné</p>
      </div>
    );
  }

  if (docLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (docError || !doc) {
    return (
      <div className="p-6 space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/documents")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour
        </Button>
        <p className="text-beac-rouge">
          {docError
            ? "Erreur lors du chargement du document. Veuillez réessayer."
            : "Document introuvable"}
        </p>
      </div>
    );
  }

  const infoItems = [
    { label: "Nom du fichier", value: doc.filename },
    { label: "Type", value: doc.original_extension },
    { label: "Taille", value: formatFileSize(doc.file_size_bytes) },
    { label: "Statut", value: null, badge: true },
    { label: "Catégorie", value: doc.category || "-" },
    { label: "Créé le", value: formatDate(doc.created_at) },
    { label: "Mis à jour le", value: formatDate(doc.updated_at) },
    { label: "Hash SHA-256", value: doc.file_hash },
    { label: "Importé par (matricule)", value: doc.uploader_matricule || "-" },
    { label: "Importé par (nom)", value: doc.uploader_name || "-" },
    { label: "URL source", value: doc.source_url || "-" },
    { label: "Nombre de pages", value: doc.page_count?.toString() || "-" },
    { label: "Nombre de chunks", value: doc.chunk_count.toString() },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/documents")}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-beac-bleue">{doc.filename}</h1>
          <p className="text-sm text-muted-foreground">Détails du document</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-beac-bleue mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Informations
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {infoItems.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              {item.badge ? (
                <dd className="mt-0.5">
                  <StatusBadge status={doc.processing_status} />
                </dd>
              ) : (
                <dd className="text-sm font-medium break-all mt-0.5">
                  {item.value}
                </dd>
              )}
            </div>
          ))}
        </dl>
        {doc.error_message && (
          <div className="mt-4 p-3 bg-beac-rouge/5 border border-beac-rouge/20 rounded-lg">
            <p className="text-sm text-beac-rouge">
              <strong>Erreur :</strong> {doc.error_message}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-beac-bleue mb-4">
          Chunks ({chunksData?.total ?? 0})
        </h2>

        {chunksLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !chunksData?.chunks.length ? (
          <p className="text-sm text-muted-foreground">Aucun chunk</p>
        ) : (
          <div className="space-y-2">
            {chunksData.chunks.map((chunk, i) => {
              const expanded = expandedChunks.has(i);
              return (
                <div
                  key={chunk.id}
                  className="border rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleChunk(i)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-sm">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        Chunk #{chunk.chunk_index}
                      </span>
                      {chunk.page_number != null && (
                        <span className="text-muted-foreground">
                          Page {chunk.page_number}
                        </span>
                      )}
                      {chunk.token_count != null && (
                        <span className="text-muted-foreground">
                          {chunk.token_count} tokens
                        </span>
                      )}
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 border-t">
                      <div className="prose prose-sm max-w-none mt-3 text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {chunk.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function DocumentDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48" />
        </div>
      }
    >
      <DocumentDetailContent />
    </Suspense>
  );
}
