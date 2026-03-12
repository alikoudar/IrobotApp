"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS } from "@/lib/constants";
import { useCategories } from "@/hooks/use-categories";

interface DocumentFiltersProps {
  status: string;
  category: string;
  uploadedBy: string;
  onStatusChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onUploadedByChange: (value: string) => void;
}

export function DocumentFilters({
  status,
  category,
  uploadedBy,
  onStatusChange,
  onCategoryChange,
  onUploadedByChange,
}: DocumentFiltersProps) {
  const { data: categoriesData } = useCategories();

  return (
    <div className="flex gap-3 flex-wrap">
      <Select value={status} onValueChange={(v) => onStatusChange(v ?? "all")}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={(v) => onCategoryChange(v ?? "all")}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Toutes les catégories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les catégories</SelectItem>
          {categoriesData?.categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.name}>
              {cat.name} ({cat.document_count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={uploadedBy}
        onChange={(e) => onUploadedByChange(e.target.value)}
        placeholder="Filtrer par matricule"
        className="w-[180px]"
      />
    </div>
  );
}
