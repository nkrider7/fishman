/**
 * Resolve local same-document $ref pointers (#/…).
 * External refs are left unresolved and reported as warnings.
 */

const MAX_DEPTH = 32;

export function dereferenceLocal(
  root: Record<string, unknown>,
  warnings: string[],
): Record<string, unknown> {
  return walk(root, root, new Set(), 0, warnings) as Record<string, unknown>;
}

function walk(
  node: unknown,
  root: Record<string, unknown>,
  stack: Set<string>,
  depth: number,
  warnings: string[],
): unknown {
  if (depth > MAX_DEPTH) {
    warnings.push("Stopped resolving $ref — maximum depth exceeded.");
    return node;
  }
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, root, stack, depth + 1, warnings));
  }

  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    if (!ref.startsWith("#/")) {
      warnings.push(`Skipped external $ref: ${ref}`);
      return obj;
    }
    if (stack.has(ref)) {
      warnings.push(`Circular $ref detected: ${ref}`);
      return obj;
    }
    const target = resolvePointer(root, ref);
    if (target == null) {
      warnings.push(`Unresolved $ref: ${ref}`);
      return obj;
    }
    stack.add(ref);
    const resolved = walk(target, root, stack, depth + 1, warnings);
    stack.delete(ref);
    // Merge sibling keys onto resolved object (OpenAPI allows this)
    if (
      resolved &&
      typeof resolved === "object" &&
      !Array.isArray(resolved)
    ) {
      const { $ref: _r, ...siblings } = obj;
      return { ...(resolved as Record<string, unknown>), ...siblings };
    }
    return resolved;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = walk(value, root, stack, depth + 1, warnings);
  }
  return out;
}

function resolvePointer(
  root: Record<string, unknown>,
  ref: string,
): unknown {
  const path = ref.replace(/^#\//, "").split("/");
  let current: unknown = root;
  for (const raw of path) {
    const key = decodeURIComponent(raw.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
