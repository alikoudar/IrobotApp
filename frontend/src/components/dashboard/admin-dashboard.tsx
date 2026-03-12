"use client";

import { useAdminDashboard } from "@/hooks/use-dashboard";
import { MetricCard } from "./metric-card";
import { TokenUsageTable } from "./token-usage-table";
import { UsersByRoleChart } from "./charts/users-by-role-chart";
import { TokenUsageChart } from "./charts/token-usage-chart";
import { FeedbackChart } from "./charts/feedback-chart";
import { SystemHealthChart } from "./charts/system-health-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

export function AdminDashboard() {
  const { data, isLoading } = useAdminDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Utilisateurs" value={formatNumber(data.total_users)} />
        <MetricCard label="Conversations" value={formatNumber(data.total_conversations)} />
        <MetricCard label="Messages" value={formatNumber(data.total_messages)} />
        <MetricCard
          label="Coût total (XAF)"
          value={`${formatNumber(Math.round(data.total_cost_xaf))} XAF`}
          variant="accent"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Coût total (USD)"
          value={`$${(data.total_cost_usd || 0).toFixed(4)}`}
        />
        <MetricCard
          label="Tokens entrants"
          value={formatNumber(data.total_input_tokens || 0)}
        />
        <MetricCard
          label="Tokens sortants"
          value={formatNumber(data.total_output_tokens || 0)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">
            Utilisateurs par rôle
          </h3>
          <UsersByRoleChart data={data.users_by_role || []} />
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">
            Utilisation des tokens
          </h3>
          <TokenUsageChart data={data.token_usage} />
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-beac-bleue mb-3">
          Détail des tokens
        </h3>
        <TokenUsageTable data={data.token_usage} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">Retours utilisateurs</h3>
          <FeedbackChart data={data.feedback} />
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">Santé du système</h3>
          <SystemHealthChart data={data.system_health} />
        </Card>
      </div>
    </div>
  );
}
