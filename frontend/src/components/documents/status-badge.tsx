import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  uploaded: "bg-muted text-muted-foreground",
  converting: "bg-beac-or-light text-beac-or",
  ocr_pending: "bg-beac-or-light text-beac-or",
  ocr_processing: "bg-beac-or-light text-beac-or",
  chunking: "bg-beac-or-light text-beac-or",
  embedding: "bg-beac-or-light text-beac-or",
  ready: "bg-green-100 text-beac-vert",
  failed: "bg-red-100 text-beac-rouge",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs font-semibold", statusStyles[status] || "")}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}
