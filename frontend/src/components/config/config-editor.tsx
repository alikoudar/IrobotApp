"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig, useUpdateConfig } from "@/hooks/use-config";
import { CONFIG_LABELS, CONFIG_CATEGORY_LABELS } from "@/lib/constants";
import { toast } from "sonner";

export function ConfigEditor() {
  const { data, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (data?.configs) {
      const v: Record<string, unknown> = {};
      data.configs.forEach((c) => {
        v[c.key] = c.value;
      });
      setValues(v);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (!data?.configs) return null;

  // Group by category
  const groups: Record<string, typeof data.configs> = {};
  data.configs.forEach((c) => {
    const cat = c.category || "general";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(c);
  });

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync(values);
      toast.success("Configuration enregistrée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    }
  };

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([cat, items]) => (
        <Card key={cat} className="p-5">
          <h3 className="text-sm font-semibold text-beac-bleue mb-4">
            {CONFIG_CATEGORY_LABELS[cat] || cat}
          </h3>
          <div className="space-y-4">
            {items.map((c) => (
              <div
                key={c.key}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
              >
                <label className="text-sm font-medium w-52 shrink-0">
                  {CONFIG_LABELS[c.key] || c.key}
                </label>
                <Input
                  type={typeof c.value === "number" ? "number" : "text"}
                  step={typeof c.value === "number" ? "any" : undefined}
                  value={values[c.key] != null ? String(values[c.key]) : ""}
                  onChange={(e) => {
                    const val =
                      typeof c.value === "number"
                        ? parseFloat(e.target.value) || 0
                        : e.target.value;
                    setValues((prev) => ({ ...prev, [c.key]: val }));
                  }}
                  className="max-w-xs"
                />
                {c.description && (
                  <span className="text-xs text-muted-foreground">
                    {c.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Button
        onClick={handleSave}
        disabled={updateConfig.isPending}
        className="bg-beac-bleue hover:bg-beac-bleue-dark"
      >
        {updateConfig.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
      </Button>
    </div>
  );
}
