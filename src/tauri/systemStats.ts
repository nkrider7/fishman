import { invoke } from "@tauri-apps/api/core";

export interface SystemStats {
  cpuPercent: number | null;
  memoryMb: number | null;
  uptimeSecs: number;
  pid: number;
}

export async function getSystemStats(): Promise<SystemStats> {
  return invoke<SystemStats>("get_system_stats");
}
