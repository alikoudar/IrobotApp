"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { PasswordInput } from "@/components/shared/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-beac-bleu-nuit to-beac-bleue p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-beac-bleue">
            <Image src="/logo-white.svg" alt="IroBot" width={40} height={40} />
          </div>
          <h1 className="text-3xl font-bold text-beac-bleue">IroBot</h1>
          <p className="text-sm text-muted-foreground mt-1">
            L&apos;IA au Service de l&apos;Expertise Interne
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              autoFocus
              disabled={loading}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Mot de passe"
              disabled={loading}
              className="h-11"
            />
          </div>

          {error && (
            <p className="text-sm text-beac-rouge text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full h-11 bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            disabled={loading || !email || !password}
          >
            {loading ? "Connexion..." : "Connexion"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Banque des États de l&apos;Afrique Centrale
        </p>
      </Card>
    </div>
  );
}
