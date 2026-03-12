"use client";

import { createContext, useState, useEffect } from "react";
import type { Role } from "@/lib/types";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

export const RoleContext = createContext<RoleContextValue>({
  role: "admin",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("admin");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("app-role") as Role | null;
    if (stored && ["admin", "manager", "user"].includes(stored)) {
      setRoleState(stored);
    }
    setMounted(true);
  }, []);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    localStorage.setItem("app-role", newRole);
  };

  if (!mounted) return null;

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}
