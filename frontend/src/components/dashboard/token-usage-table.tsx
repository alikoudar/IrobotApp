import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OPERATION_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import type { TokenUsageByOperation } from "@/lib/types";

interface TokenUsageTableProps {
  data: TokenUsageByOperation[];
}

export function TokenUsageTable({ data }: TokenUsageTableProps) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Opération</TableHead>
          <TableHead>Modèle</TableHead>
          <TableHead className="text-right">Tokens entrée</TableHead>
          <TableHead className="text-right">Tokens sortie</TableHead>
          <TableHead className="text-right">Coût USD</TableHead>
          <TableHead className="text-right">Coût XAF</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell>{OPERATION_LABELS[row.operation] || row.operation}</TableCell>
            <TableCell className="text-muted-foreground">{row.model}</TableCell>
            <TableCell className="text-right">{formatNumber(row.total_input_tokens)}</TableCell>
            <TableCell className="text-right">{formatNumber(row.total_output_tokens)}</TableCell>
            <TableCell className="text-right">${(row.total_cost_usd || 0).toFixed(4)}</TableCell>
            <TableCell className="text-right">{formatNumber(Math.round(row.total_cost_xaf || 0))} XAF</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
