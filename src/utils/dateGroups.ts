import type { HistoryGroup } from "@/types/history";

export function getHistoryGroup(timestamp: number): HistoryGroup {
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - now.getDay() * 86400000;

  if (timestamp >= startOfToday) return "today";
  if (timestamp >= startOfYesterday) return "yesterday";
  if (timestamp >= startOfWeek) return "thisWeek";
  return "older";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
