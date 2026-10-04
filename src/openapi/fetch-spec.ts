import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import type { SpecSource } from "./types";

export interface FetchedSpec {
  content: string;
  filename?: string;
  source: SpecSource;
  filePath?: string;
  specUrl?: string;
}

export async function pickOpenApiFile(): Promise<FetchedSpec | null> {
  const selected = await openFileDialog({
    multiple: false,
    filters: [
      {
        name: "OpenAPI / Swagger",
        extensions: ["json", "yaml", "yml"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!selected || typeof selected !== "string") return null;
  const content = await readTextFile(selected);
  const filename = selected.split(/[/\\]/).pop();
  return {
    content,
    filename,
    source: "file",
    filePath: selected,
  };
}

export async function fetchOpenApiFromUrl(
  url: string,
  options?: { ignoreSsl?: boolean; timeoutMs?: number },
): Promise<FetchedSpec> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Enter an OpenAPI/Swagger URL.");
  }

  try {
    const result = await invoke<{
      content: string;
      contentType?: string | null;
      finalUrl?: string | null;
    }>("fetch_text_url", {
      url: trimmed,
      ignoreSsl: options?.ignoreSsl ?? false,
      timeoutMs: options?.timeoutMs ?? 30_000,
    });
    const finalUrl = result.finalUrl ?? trimmed;
    const filename = finalUrl.split(/[/?#]/).filter(Boolean).pop();
    return {
      content: result.content,
      filename,
      source: "url",
      specUrl: trimmed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }
}
