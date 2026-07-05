import type { ApiResponse } from "./response";
import type { RequestDraft } from "./request";

export interface HistoryEntry {
  id: string;
  request_id: string | null;
  method: string;
  url: string;
  status_code: number;
  duration_ms: number;
  response_size: number;
  request_snapshot_json: string;
  response_snapshot_json: string;
  created_at: number;
}

export interface HistorySnapshot {
  request: RequestDraft;
  response: ApiResponse;
}

export type HistoryGroup = "today" | "yesterday" | "thisWeek" | "older";

export const HISTORY_GROUP_LABELS: Record<HistoryGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  older: "Older",
};
