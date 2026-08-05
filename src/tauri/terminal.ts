import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TerminalCreateResult {
  sessionId: string;
  cwd: string;
  shell: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  code: number | null;
}

export function isTerminalAvailable(): boolean {
  return isTauri();
}

export async function createTerminalSession(options: {
  cols: number;
  rows: number;
  cwd?: string | null;
}): Promise<TerminalCreateResult> {
  return invoke<TerminalCreateResult>("terminal_create", {
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd ?? null,
  });
}

export async function writeTerminal(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke("terminal_write", { sessionId, data });
}

export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { sessionId, cols, rows });
}

export async function killTerminal(sessionId: string): Promise<void> {
  return invoke("terminal_kill", { sessionId });
}

export async function onTerminalOutput(
  handler: (event: TerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>("terminal://output", (e) => {
    handler(e.payload);
  });
}

export async function onTerminalExit(
  handler: (event: TerminalExitEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>("terminal://exit", (e) => {
    handler(e.payload);
  });
}
