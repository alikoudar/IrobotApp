"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload, Trash2, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PasswordInput } from "@/components/shared/password-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/documents/status-badge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  bulkCreateUsers,
  downloadBulkTemplate,
  downloadBulkTemplateXlsx,
  resetUserPassword,
} from "@/lib/api-client";
import type { Role } from "@/lib/types";

interface UserData {
  id: string;
  email: string;
  name: string;
  matricule: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [resetTarget, setResetTarget] = useState<UserData | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  // Create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMatricule, setNewMatricule] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("user");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editMatricule, setEditMatricule] = useState("");
  const [editRole, setEditRole] = useState<string>("user");
  const [editActive, setEditActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["users", search, roleFilter, statusFilter],
    queryFn: () =>
      fetchUsers({
        search: search || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({ email: newEmail, name: newName, matricule: newMatricule, password: newPassword, role: newRole }),
    onSuccess: () => {
      toast.success("Utilisateur créé");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewMatricule("");
      setNewPassword("");
      setNewRole("user");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      return updateUser(editTarget.id, {
        name: editName,
        email: editEmail,
        matricule: editMatricule,
        role: editRole,
        is_active: editActive,
      });
    },
    onSuccess: () => {
      toast.success("Utilisateur modifié");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No target");
      return deleteUser(deleteTarget.id);
    },
    onSuccess: () => {
      toast.success("Utilisateur désactivé");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const bulkMutation = useMutation({
    mutationFn: () => {
      if (!bulkFile) throw new Error("No file");
      return bulkCreateUsers(bulkFile);
    },
    onSuccess: (result) => {
      toast.success(
        `${result.created.length} utilisateur(s) créé(s), ${result.errors.length} erreur(s)`
      );
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setBulkOpen(false);
      setBulkFile(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => {
      if (!resetTarget) throw new Error("No target");
      return resetUserPassword(resetTarget.id, resetPassword);
    },
    onSuccess: () => {
      toast.success("Mot de passe réinitialisé");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const openEdit = (user: UserData) => {
    setEditTarget(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditMatricule(user.matricule);
    setEditRole(user.role);
    setEditActive(user.is_active);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-beac-bleue">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} utilisateur(s) au total
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await downloadBulkTemplate();
              } catch {
                toast.error("Erreur lors du téléchargement");
              }
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            Modèle CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await downloadBulkTemplateXlsx();
              } catch {
                toast.error("Erreur lors du téléchargement");
              }
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            Modèle XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Import en lot
          </Button>
          <Button
            size="sm"
            className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Input
          placeholder="Rechercher par nom ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div>
          <label className="text-xs text-muted-foreground">Rôle</label>
          <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="admin">Administrateur</SelectItem>
              <SelectItem value="manager">Gestionnaire</SelectItem>
              <SelectItem value="user">Utilisateur</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Statut</label>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : !data?.users.length ? (
          <p className="p-8 text-center text-muted-foreground">Aucun utilisateur</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Matricule</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[130px]">Rôle</TableHead>
                <TableHead className="w-[100px]">Statut</TableHead>
                <TableHead className="w-[160px]">Date de création</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user: UserData) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{user.matricule}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-beac-bleue/10 text-beac-bleue">
                      {ROLE_LABELS[user.role as Role] || user.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.is_active
                          ? "bg-beac-vert/10 text-beac-vert"
                          : "bg-beac-rouge/10 text-beac-rouge"
                      }`}
                    >
                      {user.is_active ? "Actif" : "Inactif"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(user)}
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-beac-or hover:text-beac-or"
                        onClick={() => { setResetTarget(user); setResetPassword(""); }}
                        title="Réinitialiser le mot de passe"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-beac-rouge hover:text-beac-rouge"
                        onClick={() => setDeleteTarget(user)}
                        title="Désactiver"
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
            <DialogTitle>Nouvel utilisateur</DialogTitle>
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
                placeholder="Jean Dupont"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jean@beac.int"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Matricule</label>
              <Input
                value={newMatricule}
                onChange={(e) => setNewMatricule(e.target.value)}
                placeholder="MAT001"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe</label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                showStrength
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rôle</label>
              <Select value={newRole} onValueChange={(v) => v && setNewRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utilisateur</SelectItem>
                  <SelectItem value="manager">Gestionnaire</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
                disabled={createMutation.isPending || !newName || !newEmail || !newMatricule || !newPassword}
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
            <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
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
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Matricule</label>
              <Input
                value={editMatricule}
                onChange={(e) => setEditMatricule(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rôle</label>
              <Select value={editRole} onValueChange={(v) => v && setEditRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utilisateur</SelectItem>
                  <SelectItem value="manager">Gestionnaire</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="edit-active" className="text-sm">
                Compte actif
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Annuler
              </Button>
              <Button
                type="submit"
                className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
                disabled={updateMutation.isPending}
              >
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import en lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Téléversez un fichier CSV ou XLSX avec les colonnes : email, nom,
              matricule, mot_de_passe, role
            </p>
            <Input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
              disabled={!bulkFile || bulkMutation.isPending}
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending ? "Import..." : "Importer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setResetPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Définir un nouveau mot de passe pour <strong>{resetTarget?.name}</strong>
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nouveau mot de passe</label>
              <PasswordInput
                value={resetPassword}
                onChange={setResetPassword}
                showStrength
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetPassword(""); }}>
              Annuler
            </Button>
            <Button
              className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
              disabled={!resetPassword || resetPasswordMutation.isPending}
              onClick={() => resetPasswordMutation.mutate()}
            >
              {resetPasswordMutation.isPending ? "Réinitialisation..." : "Réinitialiser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Désactiver l'utilisateur"
        description={`Désactiver le compte de « ${deleteTarget?.name} » ? L'utilisateur ne pourra plus se connecter.`}
        onConfirm={() => deleteMutation.mutate()}
        confirmLabel="Désactiver"
        destructive
      />
    </div>
  );
}
