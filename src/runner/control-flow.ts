import type { RunnerQueueItem } from "./types";

export function resolveNextRequestIndex(
  queue: RunnerQueueItem[],
  nextName: string,
  fromIndex: number,
): number {
  const needle = nextName.trim().toLowerCase();
  if (!needle) return -1;

  // Prefer match after current index (forward jump), then wrap full search.
  for (let i = fromIndex + 1; i < queue.length; i++) {
    const item = queue[i];
    if (
      item.name.toLowerCase() === needle ||
      item.requestId.toLowerCase() === needle
    ) {
      return i;
    }
  }
  for (let i = 0; i <= fromIndex; i++) {
    const item = queue[i];
    if (
      item.name.toLowerCase() === needle ||
      item.requestId.toLowerCase() === needle
    ) {
      return i;
    }
  }
  return -1;
}
