"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCw, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { deleteDocument, retryDocument, updateDocument } from "@/lib/api-client";
import { useCategories } from "@/hooks/use-categories";
import { formatDate, truncate } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Document } from "@/lib/types";

interface DocumentTableProps {
  documents: Document[];
  isLoading: boolean;
}

export function DocumentTable({ documents, isLoading }: DocumentTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [editTarget, setEditTarget] = useState<Document | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: categoriesData } = useCategories();
  const categories = categoriesData?.categories ?? [];

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      toast.success("Document supprimé");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryDocument(id);
      toast.info("Relance du traitement");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la relance");
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await updateDocument(editTarget.id, { category: selectedCategory || undefined });
      toast.success("Catégorie mise à jour");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (!documents.length) {
    return <EmptyState message="Aucun document" />;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead className="w-[140px]">Statut</TableHead>
            <TableHead className="w-[120px]">Catégorie</TableHead>
            <TableHead className="w-[120px]">Matricule</TableHead>
            <TableHead className="w-[160px]">Date</TableHead>
            <TableHead className="w-[120px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id} className="hover:bg-secondary/50">
              <TableCell className="font-medium" title={doc.filename}>
                <button
                  onClick={() => router.push(`/documents/detail?id=${doc.id}`)}
                  className="text-left hover:text-beac-bleue hover:underline transition-colors"
                >
                  {truncate(doc.filename, 40)}
                </button>
              </TableCell>
              <TableCell>
                <StatusBadge status={doc.processing_status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {doc.category || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {doc.uploader_matricule || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(doc.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {doc.processing_status === "failed" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-beac-or hover:text-beac-or"
                      onClick={() => handleRetry(doc.id)}
                      title="Relancer"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-beac-bleue hover:text-beac-bleue"
                    onClick={() => {
                      setEditTarget(doc);
                      setSelectedCategory(doc.category || "");
                    }}
                    title="Modifier la catégorie"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-beac-rouge hover:text-beac-rouge"
                    onClick={() => setDeleteTarget(doc)}
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer le document"
        description={`Supprimer le document « ${deleteTarget?.filename} » ? Cette action est irréversible.`}
        onConfirm={handleDelete}
        confirmLabel="Supprimer"
        destructive
      />

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la catégorie</DialogTitle>
          </DialogHeader>
          <Select
            value={selectedCategory}
            onValueChange={(val) => setSelectedCategory(val ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner une catégorie" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Annuler
            </Button>
            <Button onClick={handleEdit}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
