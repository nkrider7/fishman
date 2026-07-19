/**
 * Slugify a request/folder name into a filesystem-safe filename stem.
 * Collisions are handled by callers via `uniqueSlug`.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "untitled";
}

/** Pick a unique slug given a set of already-used stems (without extension). */
export function uniqueSlug(
  name: string,
  used: Set<string>,
  options?: { maxLength?: number },
): string {
  const maxLength = options?.maxLength ?? 64;
  let base = slugify(name).slice(0, maxLength);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let i = 2;
  while (i < 10_000) {
    const suffix = `-${i}`;
    const stem = `${base.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    if (!used.has(stem)) {
      used.add(stem);
      return stem;
    }
    i += 1;
  }

  const fallback = `${base.slice(0, 48)}-${Date.now().toString(36)}`;
  used.add(fallback);
  return fallback;
}
