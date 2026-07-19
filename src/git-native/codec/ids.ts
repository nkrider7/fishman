/** Generate a stable uid for new git-native documents. */
export function createUid(prefix: "req" | "fld" | "env" | "col" = "req"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function ensureId(existing: string | undefined, fallback: () => string): string {
  return existing && existing.length > 0 ? existing : fallback();
}
