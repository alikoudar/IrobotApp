"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDocuments } from "@/lib/api-client";
import { TERMINAL_STATUSES } from "@/lib/constants";

interface DocumentFilters {
  status?: string;
  category?: string;
  search?: string;
  uploaded_by?: string;
}

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: () => fetchDocuments({ ...filters, limit: 100 }),
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.documents.some(
        (d) => !TERMINAL_STATUSES.includes(d.processing_status)
      );
      return hasProcessing ? 5000 : false;
    },
  });
}
