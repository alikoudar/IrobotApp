"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAuditLogs } from "@/lib/api-client";

interface AuditFilters {
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export function useAuditLogs(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => fetchAuditLogs({
      ...filters,
      limit: filters.limit || 50,
    }),
  });
}
