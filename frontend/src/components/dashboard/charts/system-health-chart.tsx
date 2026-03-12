"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SystemHealth } from "@/lib/types";

interface SystemHealthChartProps {
  data: SystemHealth;
}

const ITEMS = [
  { key: "queue_depth" as const, name: "File d'attente", color: "#005ca9" },
  { key: "processing_documents" as const, name: "En traitement", color: "#c2a712" },
  { key: "failed_jobs" as const, name: "Tâches échouées", color: "#E30613" },
];

export function SystemHealthChart({ data }: SystemHealthChartProps) {
  const chartData = ITEMS.map((item) => ({
    name: item.name,
    value: data[item.key],
    color: item.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
