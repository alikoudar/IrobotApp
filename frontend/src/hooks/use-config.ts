"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchConfig, updateConfig } from "@/lib/api-client";

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => updateConfig(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}
