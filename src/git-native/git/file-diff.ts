import type { GitFileStatus } from "./types";

export type GitDiffLineKind = "context" | "add" | "del";

export interface GitDiffLine {
  kind: GitDiffLineKind;
  /** 1-based; omitted for pure add/del counterparts */
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface GitDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: GitDiffLine[];
}

export interface GitFileDiff {
  path: string;
  absolutePath: string;
  staged: boolean;
  status: GitFileStatus;
  /** UI badge */
  badge: "ADDED" | "DELETED" | "MODIFIED" | "RENAMED" | "UNTRACKED";
  binary: boolean;
  /** Empty when binary */
  hunks: GitDiffHunk[];
  oldText: string;
  newText: string;
}

/**
 * Myers-inspired line diff via LCS DP (good enough for API JSON / .fish files).
 * Caps very large files to keep UI responsive.
 */
const MAX_LINES = 4000;

function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  // Keep trailing empty line semantics consistent with editors
  if (text.endsWith("\n") || text.endsWith("\r\n")) {
    // split leaves trailing empty — fine
  }
  return lines;
}

function isProbablyBinary(bytes: Uint8Array | string): boolean {
  if (typeof bytes === "string") {
    return bytes.includes("\0");
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 8000));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

export function decodeBlob(data: Uint8Array | string): string {
  if (typeof data === "string") return data;
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

export function buildFileDiff(input: {
  path: string;
  absolutePath: string;
  staged: boolean;
  status: GitFileStatus;
  oldText: string;
  newText: string;
  binary?: boolean;
}): GitFileDiff {
  const binary =
    input.binary ??
    (isProbablyBinary(input.oldText) || isProbablyBinary(input.newText));

  let badge: GitFileDiff["badge"] = "MODIFIED";
  if (input.status === "untracked") badge = "UNTRACKED";
  else if (input.status === "added") badge = "ADDED";
  else if (input.status === "deleted") badge = "DELETED";
  else if (input.status === "renamed") badge = "RENAMED";
  else if (!input.oldText && input.newText) badge = "ADDED";
  else if (input.oldText && !input.newText) badge = "DELETED";

  if (binary) {
    return {
      path: input.path,
      absolutePath: input.absolutePath,
      staged: input.staged,
      status: input.status,
      badge,
      binary: true,
      hunks: [],
      oldText: "",
      newText: "",
    };
  }

  const hunks = computeHunks(input.oldText, input.newText);
  return {
    path: input.path,
    absolutePath: input.absolutePath,
    staged: input.staged,
    status: input.status,
    badge,
    binary: false,
    hunks,
    oldText: input.oldText,
    newText: input.newText,
  };
}

function computeHunks(oldText: string, newText: string): GitDiffHunk[] {
  let a = splitLines(oldText);
  let b = splitLines(newText);

  // Drop final empty line pair noise when both ended with newline-only empty
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    a = a.slice(0, MAX_LINES);
    b = b.slice(0, MAX_LINES);
  }

  // Fast paths
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) {
    return [
      makeHunk(
        0,
        0,
        1,
        b.length,
        b.map((text, i) => ({
          kind: "add" as const,
          oldLine: null,
          newLine: i + 1,
          text,
        })),
      ),
    ];
  }
  if (b.length === 0) {
    return [
      makeHunk(
        1,
        a.length,
        0,
        0,
        a.map((text, i) => ({
          kind: "del" as const,
          oldLine: i + 1,
          newLine: null,
          text,
        })),
      ),
    ];
  }

  const n = a.length;
  const m = b.length;
  // LCS lengths
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () =>
    new Uint16Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? (dp[i + 1]![j + 1]! + 1) as number
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!) as number;
    }
  }

  type Op = { kind: GitDiffLineKind; ai: number | null; bi: number | null };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "context", ai: i, bi: j });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: "del", ai: i, bi: null });
      i++;
    } else {
      ops.push({ kind: "add", ai: null, bi: j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "del", ai: i, bi: null });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "add", ai: null, bi: j });
    j++;
  }

  // Group into hunks with context (3 lines)
  const CONTEXT = 3;
  const changeIdx: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== "context") changeIdx.push(idx);
  });
  if (changeIdx.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  let start = Math.max(0, changeIdx[0]! - CONTEXT);
  let end = Math.min(ops.length - 1, changeIdx[0]! + CONTEXT);
  for (let k = 1; k < changeIdx.length; k++) {
    const c = changeIdx[k]!;
    const nextStart = Math.max(0, c - CONTEXT);
    if (nextStart <= end + 1) {
      end = Math.min(ops.length - 1, c + CONTEXT);
    } else {
      ranges.push({ start, end });
      start = nextStart;
      end = Math.min(ops.length - 1, c + CONTEXT);
    }
  }
  ranges.push({ start, end });

  return ranges.map(({ start: s, end: e }) => {
    const slice = ops.slice(s, e + 1);
    const lines: GitDiffLine[] = slice.map((op) => ({
      kind: op.kind,
      oldLine: op.ai != null ? op.ai + 1 : null,
      newLine: op.bi != null ? op.bi + 1 : null,
      text: op.ai != null ? a[op.ai]! : b[op.bi!]!,
    }));

    const oldLines = lines.filter((l) => l.kind !== "add");
    const newLines = lines.filter((l) => l.kind !== "del");
    const oldStart = oldLines.find((l) => l.oldLine != null)?.oldLine ?? 0;
    const newStart = newLines.find((l) => l.newLine != null)?.newLine ?? 0;

    return makeHunk(
      oldStart,
      oldLines.length,
      newStart,
      newLines.length,
      lines,
    );
  });
}

function makeHunk(
  oldStart: number,
  oldCount: number,
  newStart: number,
  newCount: number,
  lines: GitDiffLine[],
): GitDiffHunk {
  return {
    oldStart,
    oldCount,
    newStart,
    newCount,
    header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    lines,
  };
}
