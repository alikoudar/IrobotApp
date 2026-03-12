"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/api-client";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCategory({
        name: newName,
        description: newDescription || undefined,
      }),
    onSuccess: () => {
      toast.success("Catégorie créée");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      return updateCategory(editTarget.id, {
        name: editName,
        description: editDescription,
      });
    },
    onSuccess: () => {
      toast.success("Catégorie modifiée");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No target");
      return deleteCategory(deleteTarget.id);
    },
    onSuccess: () => {
      toast.success("Catégorie supprimée");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const openEdit = (cat: Category) => {
    setEditTarget(cat);
    setEditName(cat.name);
    setEditDescription(cat.description || "");
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-beac-bleue">Catégories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} catégorie(s) au total
          </p>
        </div>
        <Button
          size="sm"
          className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nouvelle catégorie
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : !data?.categories.length ? (
          <p className="p-8 text-center text-muted-foreground">Aucune catégorie</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Documents</TableHead>
                <TableHead className="w-[160px]">Date de création</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.categories.map((cat: Category) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {cat.description || "-"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-beac-bleue/10 text-beac-bleue">
                      {cat.document_count}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(cat.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(cat)}
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-beac-rouge hover:text-beac-rouge"
                        onClick={() => setDeleteTarget(cat)}
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
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Rapports financiers"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optionnelle)</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description de la catégorie..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
                disabled={createMutation.isPending || !newName.trim()}
              >
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la catégorie</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Annuler
              </Button>
              <Button
                type="submit"
                className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
                disabled={updateMutation.isPending || !editName.trim()}
              >
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer la catégorie"
        description={`Supprimer la catégorie « ${deleteTarget?.name} » ? Les documents associés perdront leur catégorie.`}
        onConfirm={() => deleteMutation.mutate()}
        confirmLabel="Supprimer"
        destructive
      />
    </div>
  );
}
