import { useEffect, useState } from "react";
import { getSystemStats, type SystemStats } from "@/tauri/systemStats";
import { ResourceCard } from "./ResourceCard";

interface PerformanceTabProps {
  active: boolean;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function PerformanceTab({ active }: PerformanceTabProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const next = await getSystemStats();
        if (!cancelled) {
          setStats(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to read system stats",
          );
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  if (error && !stats) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <h3 className="text-xs font-semibold text-foreground">System Resources</h3>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  const cpu =
    stats?.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : "—";
  const memory =
    stats?.memoryMb != null ? `${stats.memoryMb.toFixed(1)} MB` : "—";
  const uptime =
    stats != null ? formatUptime(stats.uptimeSecs) : "—";
  const pid = stats != null ? String(stats.pid) : "—";

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div>
        <h3 className="text-xs font-semibold text-foreground">System Resources</h3>
        <p className="text-[11px] text-muted-foreground">
          Fishman process — updates every 5s while this tab is open
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <ResourceCard label="CPU Usage" value={cpu} />
        <ResourceCard label="Memory Usage" value={memory} />
        <ResourceCard label="Uptime" value={uptime} />
        <ResourceCard label="Process ID" value={pid} />
      </div>
      {error ? (
        <p className="text-[11px] text-muted-foreground">{error}</p>
      ) : null}
    </div>
  );
}
