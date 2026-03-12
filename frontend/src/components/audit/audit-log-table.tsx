"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { ACTION_LABELS, ENTITY_TYPE_OPTIONS } from "@/lib/constants";
import { formatDate, truncate } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { archiveAuditLogs, fetchAuditArchives, downloadAuditArchive } from "@/lib/api-client";
import { toast } from "sonner";

const LIMIT = 50;

export function AuditLogTable() {
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const [showArchives, setShowArchives] = useState(false);

  const { data, isLoading, refetch } = useAuditLogs({
    action: action === "all" ? undefined : action,
    entity_type: entityType === "all" ? undefined : entityType,
    date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
    limit: LIMIT,
    offset,
  });

  const { data: archivesData, refetch: refetchArchives } = useQuery({
    queryKey: ["audit-archives"],
    queryFn: fetchAuditArchives,
    enabled: showArchives,
  });

  const total = data?.total || 0;
  const start = offset + 1;
  const end = Math.min(offset + LIMIT, total);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const result = await archiveAuditLogs();
      toast.success(result.message);
      refetch();
      if (showArchives) refetchArchives();
    } catch {
      toast.error("Erreur lors de l'archivage");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={action} onValueChange={(v) => { setAction(v ?? "all"); setOffset(0); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v ?? "all"); setOffset(0); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || "all"} value={opt.value || "all"}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Du</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
            className="w-[160px]"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Au</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
            className="w-[160px]"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchives(!showArchives)}
          >
            <Archive className="h-4 w-4 mr-1" />
            {showArchives ? "Masquer archives" : "Voir archives"}
          </Button>
          <Button
            size="sm"
            className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            onClick={handleArchive}
            disabled={archiving}
          >
            <Archive className="h-4 w-4 mr-1" />
            {archiving ? "Archivage..." : "Archiver"}
          </Button>
        </div>
      </div>

      {showArchives && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-beac-bleue mb-3">
            Archives ({archivesData?.archives.length ?? 0})
          </h3>
          {!archivesData?.archives.length ? (
            <p className="text-sm text-muted-foreground">Aucune archive</p>
          ) : (
            <div className="space-y-2">
              {archivesData.archives.map((archive) => (
                <div
                  key={archive.name}
                  className="flex items-center justify-between p-2 border rounded-lg text-sm"
                >
                  <div>
                    <span className="font-medium">{archive.name}</span>
                    <span className="text-muted-foreground ml-3">
                      {archive.size ? `${(archive.size / 1024).toFixed(1)} Ko` : ""}
                    </span>
                    {archive.last_modified && (
                      <span className="text-muted-foreground ml-3">
                        {formatDate(archive.last_modified)}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={async () => {
                      try {
                        await downloadAuditArchive(archive.download_url, archive.name);
                      } catch {
                        toast.error("Échec du téléchargement");
                      }
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data?.logs.length ? (
        <EmptyState message="Aucune entrée" />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Détails</TableHead>
                <TableHead>Adresse IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs.map((log) => {
                const detailStr = log.details && Object.keys(log.details).length
                  ? Object.entries(log.details)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(", ")
                  : "-";

                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>{ACTION_LABELS[log.action] || log.action}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.entity_type || "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span
                        className="text-sm text-muted-foreground truncate block"
                        title={JSON.stringify(log.details, null, 2)}
                      >
                        {truncate(detailStr, 50)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.ip_address || "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Affichage {start}-{end} sur {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
