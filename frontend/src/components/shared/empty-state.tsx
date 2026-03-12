interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = "Aucun élément" }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
      {message}
    </div>
  );
}
