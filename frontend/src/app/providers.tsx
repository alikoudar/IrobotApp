"use client";

import { usePathname } from "next/navigation";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/shared/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname === "/login/";

  return (
    <QueryProvider>
      <AuthProvider>
        {isLoginPage ? (
          children
        ) : (
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        )}
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryProvider>
  );
}
