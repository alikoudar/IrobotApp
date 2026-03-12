import type { FeedbackStats as FeedbackStatsType } from "@/lib/types";

interface FeedbackStatsProps {
  data: FeedbackStatsType;
}

export function FeedbackStats({ data }: FeedbackStatsProps) {
  const rows = [
    { label: "Total", value: data.total },
    { label: "Positifs", value: data.positive, color: "text-beac-vert" },
    { label: "Négatifs", value: data.negative, color: "text-beac-rouge" },
    {
      label: "Score moyen",
      value: data.average_score != null ? data.average_score.toFixed(2) : "N/A",
    },
    {
      label: "Taux de feedback",
      value: data.feedback_ratio != null ? `${data.feedback_ratio}%` : "N/A",
      sublabel: data.total_messages > 0 ? `${data.total} / ${data.total_messages} messages` : undefined,
    },
  ];

  return (
    <div className="space-y-0">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between py-2 border-b border-border/50 text-sm"
        >
          <span>
            {row.label}
            {"sublabel" in row && row.sublabel && (
              <span className="text-xs text-muted-foreground ml-1">({row.sublabel})</span>
            )}
          </span>
          <span className={`font-semibold ${row.color || ""}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
