/**
 * Pure helpers for reading / merging local branch lists.
 * Handles unborn repos where HEAD is `ref: refs/heads/X` but refs/heads/X
 * does not exist yet (no commits).
 */

/** Parse `.git/HEAD` file contents into a local branch name, if symbolic. */
export function parseSymbolicHeadBranch(headContents: string): string | null {
  const text = headContents.trim();
  const match = /^ref:\s*refs\/heads\/(.+)$/i.exec(text);
  const name = match?.[1]?.trim();
  return name || null;
}

/** True when HEAD looks like a raw OID (detached) rather than a symbolic ref. */
export function isDetachedHeadContents(headContents: string): boolean {
  const text = headContents.trim();
  if (!text) return false;
  if (/^ref:/i.test(text)) return false;
  return /^[0-9a-f]{7,40}$/i.test(text);
}

/**
 * Merge isomorphic-git `listBranches` with the symbolic HEAD name so unborn
 * branches still appear in the UI.
 */
export function mergeLocalBranches(
  listed: string[],
  symbolicHead: string | null,
): string[] {
  const branches = listed.filter(
    (b): b is string => typeof b === "string" && b.trim().length > 0,
  );
  if (symbolicHead && !branches.includes(symbolicHead)) {
    return [symbolicHead, ...branches];
  }
  return branches;
}

export function normalizeBranchName(name: string): string {
  return name.trim().replace(/^refs\/heads\//i, "");
}
