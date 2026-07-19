/**
 * Sanitize a request/folder display name into a safe filename stem.
 * Preserves spaces for readable Git paths (e.g. "Create User.fish").
 */
export function filenameFromName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled";
}

export function requestFileName(name: string): string {
  const stem = filenameFromName(name);
  return stem.toLowerCase().endsWith(".fish") ? stem : `${stem}.fish`;
}

/** Unique filename among siblings (adds " (2)" etc.). */
export function uniqueFileName(name: string, used: Set<string>): string {
  const file = requestFileName(name);
  if (!used.has(file.toLowerCase())) {
    used.add(file.toLowerCase());
    return file;
  }
  const stem = file.replace(/\.fish$/i, "");
  let i = 2;
  while (i < 10_000) {
    const candidate = `${stem} (${i}).fish`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
    i += 1;
  }
  return `${stem} (${Date.now()}).fish`;
}

// Keep slugify for search indexes / URL-ish ids
export { slugify, uniqueSlug } from "./slugify";
