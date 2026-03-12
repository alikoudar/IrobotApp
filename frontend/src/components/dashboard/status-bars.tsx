import { STATUS_LABELS } from "@/lib/constants";
import type { DocumentsByStatus } from "@/lib/types";

interface StatusBarsProps {
  data: DocumentsByStatus[];
}

export function StatusBars({ data }: StatusBarsProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.status} className="flex items-center gap-3">
          <span className="w-28 text-right text-sm shrink-0">
            {STATUS_LABELS[item.status] || item.status}
          </span>
          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-beac-bleue rounded transition-all"
              style={{ width: `${(item.count / max) * 100}%`, minWidth: "2px" }}
            />
          </div>
          <span className="w-10 text-sm font-semibold">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
