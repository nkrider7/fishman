import type { RequestDraft } from "@/types/request";
import { getMethodDefinition } from "./registry";

export type MethodWarningSeverity = "info" | "warning";

export interface MethodWarning {
  id: string;
  severity: MethodWarningSeverity;
  message: string;
  suggestion?: string;
}

function hasContentType(draft: RequestDraft): boolean {
  return (draft.headers ?? []).some(
    (h) => h.enabled && h.key.toLowerCase() === "content-type" && h.value.trim(),
  );
}

function hasBody(draft: RequestDraft): boolean {
  if (draft.bodyType === "none") return false;
  if (draft.bodyType === "form-data") {
    return (draft.formDataFields ?? []).some((f) => f.enabled && f.key.trim());
  }
  return draft.body.trim().length > 0;
}

const MUTATION_BODY_HINTS =
  /\b(create|update|delete|insert|upsert|remove|mutate|write|save|patch)\b/i;

/**
 * Registry-driven advisories for the active request.
 * QUERY bodies are valid — never warn like GET-with-body.
 */
export function getMethodWarnings(draft: RequestDraft): MethodWarning[] {
  const def = getMethodDefinition(draft.method);
  if (!def) return [];

  const warnings: MethodWarning[] = [];
  const bodyPresent = hasBody(draft);
  const contentTypePresent = hasContentType(draft);

  if (!def.supportsBody && bodyPresent) {
    warnings.push({
      id: "body-on-no-body-method",
      severity: "warning",
      message: `${def.name} typically should not include a request body.`,
      suggestion:
        def.name === "GET"
          ? "Use QUERY when you need a safe request with a body."
          : undefined,
    });
  }

  if (def.name === "QUERY") {
    if (!bodyPresent) {
      warnings.push({
        id: "query-missing-body",
        severity: "info",
        message: "QUERY usually includes a request body for complex filters or search criteria.",
        suggestion: "Add a JSON body, or apply a QUERY template.",
      });
    } else if (!contentTypePresent) {
      warnings.push({
        id: "query-missing-content-type",
        severity: "warning",
        message: "QUERY body is set but Content-Type is missing.",
        suggestion: "Suggest application/json",
      });
    }

    if (bodyPresent && MUTATION_BODY_HINTS.test(draft.body)) {
      warnings.push({
        id: "query-mutation-semantics",
        severity: "warning",
        message:
          "This QUERY body looks like it may modify state. QUERY must remain a read operation (RFC 10008).",
        suggestion: "Use POST, PUT, PATCH, or DELETE for mutations.",
      });
    }
  }

  return warnings;
}

/** Heuristic: POST used only for retrieval may be a QUERY candidate. */
export function suggestQueryMigration(draft: RequestDraft): string | null {
  if (draft.method !== "POST") return null;
  if (draft.bodyType === "none" || !draft.body.trim()) return null;

  const readHints =
    /\b(search|filter|query|find|list|fetch|lookup|aggregate|analytics|match)\b/i;
  if (!readHints.test(draft.body) && !readHints.test(draft.name) && !readHints.test(draft.url)) {
    return null;
  }

  if (MUTATION_BODY_HINTS.test(draft.body)) return null;

  return "This POST looks like a read-only query. Consider converting it to QUERY (RFC 10008) so intermediaries treat it as safe and idempotent.";
}
