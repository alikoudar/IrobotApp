"use client";

import { useAuth } from "./use-auth";

export function useRole() {
  const { role, setRole } = useAuth();
  return { role, setRole };
}
