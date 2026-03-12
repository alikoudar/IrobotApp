"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAdminDashboard, fetchManagerDashboard } from "@/lib/api-client";

export function useAdminDashboard() {
  return useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: fetchAdminDashboard,
    staleTime: 60_000,
  });
}

export function useManagerDashboard() {
  return useQuery({
    queryKey: ["dashboard", "manager"],
    queryFn: fetchManagerDashboard,
    staleTime: 60_000,
  });
}
