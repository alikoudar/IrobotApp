"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { DocumentsByType } from "@/lib/types";

interface TypeBarChartProps {
  data: DocumentsByType[];
}

export function TypeBarChart({ data }: TypeBarChartProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="extension" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" name="Documents" fill="#005ca9" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
