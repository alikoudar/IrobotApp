interface StatusListItem {
  label: string;
  count: number;
}

interface StatusListProps {
  items: StatusListItem[];
}

export function StatusList({ items }: StatusListProps) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>;
  }

  return (
    <div className="space-y-0">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between py-2 border-b border-border/50 text-sm"
        >
          <span>{item.label}</span>
          <span className="font-semibold">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
