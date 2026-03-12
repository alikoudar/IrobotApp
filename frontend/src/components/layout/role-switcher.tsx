"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/types";

const roles: Role[] = ["admin", "manager", "user"];

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors">
        <span className="truncate">{ROLE_LABELS[role]}</span>
        <ChevronDown className="h-4 w-4 shrink-0 ml-2" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {roles.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => setRole(r)}
            className={r === role ? "font-semibold" : ""}
          >
            {ROLE_LABELS[r]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
