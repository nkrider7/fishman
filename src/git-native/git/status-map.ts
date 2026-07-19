import type { GitFileChange, GitFileStatus } from "./types";

export type StatusMatrixRow = [string, number, number, number];

function mapSingle(row: StatusMatrixRow): GitFileChange | null {
  const [filepath, head, workdir, stage] = row;
  if (head === 1 && workdir === 1 && stage === 1) return null;

  if (head === 0 && workdir === 2 && stage === 0) {
    return { path: filepath, status: "untracked", staged: false };
  }
  if (head === 0 && workdir === 2 && stage === 2) {
    return { path: filepath, status: "added", staged: true };
  }
  if (head === 0 && workdir === 0 && stage === 2) {
    return { path: filepath, status: "added", staged: true };
  }
  if (head === 1 && workdir === 0 && stage === 1) {
    return { path: filepath, status: "deleted", staged: false };
  }
  if (head === 1 && workdir === 0 && stage === 0) {
    return { path: filepath, status: "deleted", staged: true };
  }
  if (head === 1 && workdir === 0 && stage === 3) {
    return { path: filepath, status: "deleted", staged: true };
  }
  if (head === 1 && workdir === 2 && stage === 1) {
    return { path: filepath, status: "modified", staged: false };
  }
  if (head === 1 && workdir === 2 && stage === 2) {
    return { path: filepath, status: "modified", staged: true };
  }
  if (head === 1 && workdir === 1 && stage === 2) {
    return { path: filepath, status: "modified", staged: true };
  }

  const status: GitFileStatus =
    head === 0 ? "added" : workdir === 0 ? "deleted" : "modified";
  return {
    path: filepath,
    status,
    staged: stage === 2 || stage === 3,
  };
}

/** Map isomorphic-git statusMatrix row → zero or more change entries. */
export function mapStatusMatrixRow(row: StatusMatrixRow): GitFileChange[] {
  const [filepath, head, workdir, stage] = row;
  if (head === 1 && workdir === 2 && stage === 3) {
    return [
      { path: filepath, status: "modified", staged: true },
      { path: filepath, status: "modified", staged: false },
    ];
  }
  const single = mapSingle(row);
  return single ? [single] : [];
}

export function expandStatusLetter(status: GitFileStatus): string {
  switch (status) {
    case "untracked":
      return "U";
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "conflicted":
      return "C";
    default:
      return "?";
  }
}
