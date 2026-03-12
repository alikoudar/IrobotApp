"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { OPERATION_LABELS } from "@/lib/constants";
import type { TokenUsageByOperation } from "@/lib/types";

interface TokenUsageChartProps {
  data: TokenUsageByOperation[];
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  const chartData = data.map((d) => ({
    name: OPERATION_LABELS[d.operation] || d.operation,
    "Tokens entrée": d.total_input_tokens,
    "Tokens sortie": d.total_output_tokens,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar
          dataKey="Tokens entrée"
          stackId="tokens"
          fill="#005ca9"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="Tokens sortie"
          stackId="tokens"
          fill="#c2a712"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
