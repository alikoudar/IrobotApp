import type { SystemHealth as SystemHealthType } from "@/lib/types";

interface SystemHealthProps {
  data: SystemHealthType;
}

export function SystemHealth({ data }: SystemHealthProps) {
  const rows = [
    { label: "File d'attente", value: data.queue_depth },
    {
      label: "Tâches échouées",
      value: data.failed_jobs,
      color: data.failed_jobs > 0 ? "text-beac-rouge" : undefined,
    },
    { label: "En traitement", value: data.processing_documents },
  ];

  return (
    <div className="space-y-0">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between py-2 border-b border-border/50 text-sm"
        >
          <span>{row.label}</span>
          <span className={`font-semibold ${row.color || ""}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
