interface HeadersTableProps {
  headers: Record<string, string>;
  emptyMessage?: string;
}

export function HeadersTable({
  headers,
  emptyMessage = "No headers",
}: HeadersTableProps) {
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return (
      <div className="px-3 py-4 text-[11px] text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 bg-muted/80">
        <tr className="border-b border-border/60 text-left text-muted-foreground">
          <th className="px-3 py-1.5 font-medium">NAME</th>
          <th className="px-3 py-1.5 font-medium">VALUE</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, value]) => (
          <tr
            key={key}
            className="border-b border-border/40 align-top hover:bg-muted/20"
          >
            <td className="w-[28%] max-w-48 truncate px-3 py-1.5 font-medium text-foreground/90">
              {key}
            </td>
            <td className="px-3 py-1.5 font-mono break-all text-muted-foreground">
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
