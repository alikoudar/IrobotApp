"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { STATUS_LABELS } from "@/lib/constants";
import type { DocumentsByStatus } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  ready: "#009640",
  failed: "#E30613",
  uploaded: "#c2a712",
  converting: "#005ca9",
  ocr_pending: "#bf8850",
  ocr_processing: "#662483",
  chunking: "#ea5297",
  embedding: "#ffdd00",
};

interface StatusPieChartProps {
  data: DocumentsByStatus[];
}

export function StatusPieChart({ data }: StatusPieChartProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] || d.status,
    value: d.count,
    fill: STATUS_COLORS[d.status] || "#999",
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
          labelLine={false}
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
