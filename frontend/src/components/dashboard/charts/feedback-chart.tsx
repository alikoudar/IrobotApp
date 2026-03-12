"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { FeedbackStats } from "@/lib/types";

interface FeedbackChartProps {
  data: FeedbackStats;
}

const COLORS: Record<string, string> = {
  Positifs: "#009640",
  Négatifs: "#E30613",
};

export function FeedbackChart({ data }: FeedbackChartProps) {
  const chartData = [
    { name: "Positifs", value: data.positive },
    { name: "Négatifs", value: data.negative },
  ];

  const hasData = data.positive > 0 || data.negative > 0;

  return (
    <div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 60 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground mt-2 px-1">
        <span>
          Taux de feedback :{" "}
          <strong>{data.feedback_ratio != null ? `${data.feedback_ratio}%` : "N/A"}</strong>
          {data.total_messages > 0 && (
            <span className="ml-1">({data.total} / {data.total_messages} messages)</span>
          )}
        </span>
        <span>
          Score moyen :{" "}
          <strong>{data.average_score != null ? data.average_score.toFixed(2) : "N/A"}</strong>
        </span>
      </div>
    </div>
  );
}
