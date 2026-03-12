"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { DocumentsByCategory } from "@/lib/types";

interface CategoryBarChartProps {
  data: DocumentsByCategory[];
}

export function CategoryBarChart({ data }: CategoryBarChartProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  const chartData = data.map((d) => ({
    category: d.category || "Sans catégorie",
    count: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          dataKey="category"
          type="category"
          tick={{ fontSize: 12 }}
          width={75}
        />
        <Tooltip />
        <Bar dataKey="count" name="Documents" fill="#c2a712" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
