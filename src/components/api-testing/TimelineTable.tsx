import type { TimelineRow } from "@/api-testing";

interface TimelineTableProps {
  rows: TimelineRow[];
}

export function TimelineTable({ rows }: TimelineTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Timeline updates every second while the test runs.
      </p>
    );
  }

  return (
    <div className="max-h-48 overflow-auto rounded-md border border-border">
      <table className="w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
          <tr>
            <th className="px-2 py-1.5 font-medium">Time</th>
            <th className="px-2 py-1.5 font-medium">VUs</th>
            <th className="px-2 py-1.5 font-medium">RPS</th>
            <th className="px-2 py-1.5 font-medium">Avg</th>
            <th className="px-2 py-1.5 font-medium">p95</th>
            <th className="px-2 py-1.5 font-medium">Errors</th>
            <th className="px-2 py-1.5 font-medium">Phase</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.elapsedSec}
              className="border-t border-border/60 tabular-nums"
            >
              <td className="px-2 py-1">{row.elapsedSec}s</td>
              <td className="px-2 py-1">{row.vus}</td>
              <td className="px-2 py-1">{row.rps}</td>
              <td className="px-2 py-1">{row.avgMs}ms</td>
              <td className="px-2 py-1">{row.p95Ms}ms</td>
              <td className="px-2 py-1">{row.errors}</td>
              <td className="px-2 py-1 text-muted-foreground">
                {row.phase ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
