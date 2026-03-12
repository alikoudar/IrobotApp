"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface UsersByRole {
  role: string;
  count: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "#E30613",
  manager: "#c2a712",
  user: "#005ca9",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  manager: "Manager",
  user: "Utilisateur",
};

interface UsersByRoleChartProps {
  data: UsersByRole[];
}

export function UsersByRoleChart({ data }: UsersByRoleChartProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  const chartData = data.map((d) => ({
    name: ROLE_LABELS[d.role] || d.role,
    value: d.count,
    fill: ROLE_COLORS[d.role] || "#999",
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
