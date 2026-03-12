"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { NavItem } from "./nav-item";
import { NAV_ITEMS } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, logout } = useAuth();
  const filteredItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo-white.svg" alt="" width={28} height={28} />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">IroBot</h1>
            <p className="text-xs text-white/70">Assistant IA de la BEAC</p>
          </div>
        </Link>
      </div>
      <Separator className="bg-white/10" />
      <nav className="flex-1 p-2 space-y-1">
        {filteredItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>
      <Separator className="bg-white/10" />
      <div className="p-3 space-y-2">
        {user && (
          <>
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <User className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="text-xs text-white/50">
                  {user.matricule}
                </p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-beac-bleu-nuit">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-4 bg-beac-bleu-nuit">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex items-center justify-center h-10 w-10 rounded-md text-white hover:bg-white/10">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-beac-bleu-nuit border-none">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <Image src="/logo-white.svg" alt="" width={24} height={24} className="ml-3" />
        <span className="ml-2 text-white font-bold">IroBot</span>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14 bg-secondary">
        {children}
      </main>
    </div>
  );
}
