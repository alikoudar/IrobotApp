import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const borderColors = {
  default: "border-l-beac-bleue",
  accent: "border-l-beac-or",
  success: "border-l-beac-vert",
  danger: "border-l-beac-rouge",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  variant?: keyof typeof borderColors;
}

export function MetricCard({ label, value, variant = "default" }: MetricCardProps) {
  return (
    <Card className={cn("border-l-4 p-4", borderColors[variant])}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}
