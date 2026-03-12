"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "@/lib/api-client";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}
