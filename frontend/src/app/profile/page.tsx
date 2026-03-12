"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/shared/password-input";
import { toast } from "sonner";
import { updateProfile, changePassword } from "@/lib/api-client";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProfile({ name });
      updateUser(updated);
      toast.success("Profil mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Mot de passe modifié");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-beac-bleue">Profil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos informations personnelles
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-beac-bleue mb-4">
          Informations personnelles
        </h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Nom
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Matricule</label>
            <Input
              value={user.matricule}
              disabled
              className="bg-muted"
            />
          </div>
          <Button
            type="submit"
            className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            disabled={saving}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-beac-bleue mb-4">
          Modifier le mot de passe
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="current-pw" className="text-sm font-medium">
              Mot de passe actuel
            </label>
            <PasswordInput
              id="current-pw"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Mot de passe actuel"
              disabled={changingPassword}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-pw" className="text-sm font-medium">
              Nouveau mot de passe
            </label>
            <PasswordInput
              id="new-pw"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="Nouveau mot de passe"
              showStrength
              disabled={changingPassword}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-pw" className="text-sm font-medium">
              Confirmer le mot de passe
            </label>
            <PasswordInput
              id="confirm-pw"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirmer le mot de passe"
              matchValue={newPassword}
              disabled={changingPassword}
            />
          </div>
          <Button
            type="submit"
            className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            disabled={
              changingPassword ||
              !currentPassword ||
              !newPassword ||
              newPassword !== confirmPassword
            }
          >
            {changingPassword ? "Modification..." : "Modifier le mot de passe"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
