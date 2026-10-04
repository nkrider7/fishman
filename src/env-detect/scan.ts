import type { GitNativeFs } from "@/git-native";
import { parseDotEnv } from "./parse/dotenv";
import { suggestVariables, type RawEnvPair } from "./suggest";
import type {
  DetectSourceKind,
  DetectSourceResult,
  EnvDetectReport,
} from "./types";

/** Dotenv basenames we try at the project root (Phase 1). */
export const DOTENV_CANDIDATES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.dev",
  ".env.dev.local",
] as const;

/** Example / sample files — skip (placeholders, often committed). */
const DOTENV_SKIP = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.dist",
]);

const MAX_FILE_BYTES = 512 * 1024;

export interface ScanProjectEnvOptions {
  projectPath: string;
  fs: GitNativeFs;
  /** Override scannedAt for tests. */
  now?: () => string;
}

/**
 * Scan project root for dotenv files and propose Fishman environment variables.
 * Never uses exists() on .env paths (Tauri may forbid it) — try-read instead.
 */
export async function scanProjectEnv(
  options: ScanProjectEnvOptions,
): Promise<EnvDetectReport> {
  const { projectPath, fs } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const sources: DetectSourceResult[] = [];
  const pairs: RawEnvPair[] = [];

  const root = normalizeRoot(projectPath);

  for (const name of DOTENV_CANDIDATES) {
    if (DOTENV_SKIP.has(name)) continue;
    const abs = fs.join(root, name);
    const kind: DetectSourceKind = "dotenv";
    try {
      const content = await safeReadText(fs, abs);
      if (content == null) {
        // Missing or unreadable — not an error for optional candidates.
        continue;
      }
      if (byteLength(content) > MAX_FILE_BYTES) {
        sources.push({
          path: name,
          kind,
          ok: false,
          error: `File exceeds ${MAX_FILE_BYTES} byte limit`,
        });
        continue;
      }
      const parsed = parseDotEnv(content);
      const keys = Object.keys(parsed);
      sources.push({
        path: name,
        kind,
        ok: true,
        rawCount: keys.length,
      });
      for (const key of keys) {
        pairs.push({
          key,
          value: parsed[key],
          source: { kind, path: name, originalKey: key },
        });
      }
    } catch (err) {
      sources.push({
        path: name,
        kind,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const variables = suggestVariables(pairs);

  return {
    projectPath: root,
    scannedAt: now(),
    sources,
    variables,
    suggestedEnvName: "local",
    searchedPatterns: [...DOTENV_CANDIDATES],
  };
}

async function safeReadText(
  fs: GitNativeFs,
  path: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

function byteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s).length;
  }
  return s.length;
}

function normalizeRoot(projectPath: string): string {
  return projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
}
