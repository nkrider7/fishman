import type { NetworkLogEntry } from "@/store/slices/networkLogSlice";

export type NetworkEntryFilter =
  | "all"
  | "2xx"
  | "3xx"
  | "4xx"
  | "5xx"
  | "errors";

export function filterNetworkEntries(
  entries: NetworkLogEntry[],
  filter: NetworkEntryFilter,
): NetworkLogEntry[] {
  if (filter === "all") return entries;
  if (filter === "errors") {
    return entries.filter(
      (entry) =>
        Boolean(entry.error) ||
        entry.statusCode == null ||
        entry.statusCode === 0,
    );
  }
  const prefix = filter === "2xx" ? 2 : filter === "3xx" ? 3 : filter === "4xx" ? 4 : 5;
  return entries.filter(
    (entry) =>
      entry.statusCode != null &&
      Math.floor(entry.statusCode / 100) === prefix,
  );
}
