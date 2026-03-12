"use client";

import { useManagerDashboard } from "@/hooks/use-dashboard";
import { MetricCard } from "./metric-card";
import { StatusPieChart } from "./charts/status-pie-chart";
import { TypeBarChart } from "./charts/type-bar-chart";
import { CategoryBarChart } from "./charts/category-bar-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

export function ManagerDashboard() {
  const { data, isLoading } = useManagerDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Documents" value={formatNumber(data.total_documents)} variant="accent" />
        <MetricCard label="Chunks" value={formatNumber(data.total_chunks)} />
        <MetricCard label="Moy. chunks/doc" value={data.avg_chunks_per_document.toFixed(1)} />
        <MetricCard label="Catégories" value={formatNumber(data.total_categories)} />
        <MetricCard
          label="Taux de succès"
          value={`${data.processing_success_rate.toFixed(1)}%`}
          variant="success"
        />
        <MetricCard
          label="Taux d'échec"
          value={`${data.processing_failure_rate.toFixed(1)}%`}
          variant="danger"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">Par statut</h3>
          <StatusPieChart data={data.documents_by_status} />
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">Par type</h3>
          <TypeBarChart data={data.documents_by_type} />
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">Par catégorie</h3>
          <CategoryBarChart data={data.documents_by_category} />
        </Card>
      </div>
    </div>
  );
}
