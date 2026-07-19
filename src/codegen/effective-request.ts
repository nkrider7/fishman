import type { RequestDraft } from "@/types/request";
import {
  applyApiKeyToParams,
  applyAuthToHeaders,
  buildUrlWithParams,
} from "@/utils/requestBuilder";
import { substituteRequestDraft } from "@/utils/variableSubstitution";
import { getFormDataFilePaths } from "@/types/request";
import { ensureGraphQLConfig, syncGraphQLBody } from "@/graphql";
import type { EffectiveFormField, EffectiveRequest } from "./types";

/**
 * Build the effective request the same way send does (URL, auth, enabled
 * headers/params, body), optionally interpolating environment variables.
 */
export function toEffectiveRequest(
  draft: RequestDraft,
  variables: Record<string, string>,
  interpolateVariables: boolean,
): EffectiveRequest {
  const resolved =
    interpolateVariables && Object.keys(variables).length > 0
      ? substituteRequestDraft(draft, variables)
      : draft;

  const params = applyApiKeyToParams(resolved.params, resolved.auth);
  const url = buildUrlWithParams(resolved.url || "", params);
  const headers = applyAuthToHeaders(resolved.headers, resolved.auth)
    .filter((h) => h.enabled && h.key)
    .map(({ key, value }) => ({ key, value }));

  const bodyType = resolved.bodyType;
  let body: string | undefined;
  let formData: EffectiveFormField[] | undefined;

  if (bodyType === "none") {
    body = undefined;
  } else if (bodyType === "form-data") {
    formData = (resolved.formDataFields ?? [])
      .filter((f) => f.enabled && f.key)
      .flatMap((f): EffectiveFormField[] => {
        if (f.type === "file") {
          const paths = getFormDataFilePaths(f);
          if (paths.length === 0) {
            return [{ key: f.key, type: "file", filePath: f.value || "" }];
          }
          return paths.map((filePath) => ({
            key: f.key,
            type: "file" as const,
            filePath,
          }));
        }
        return [{ key: f.key, type: "text" as const, value: f.value }];
      });
  } else if (bodyType === "graphql") {
    const graphql = ensureGraphQLConfig(resolved);
    body = graphql ? syncGraphQLBody(graphql) : resolved.body || undefined;
  } else {
    body = resolved.body || undefined;
  }

  return {
    method: resolved.method || "GET",
    url,
    headers,
    body,
    bodyType,
    formData,
  };
}

export function hasBody(req: EffectiveRequest): boolean {
  if (req.bodyType === "form-data") {
    return Boolean(req.formData?.length);
  }
  return Boolean(req.body && req.bodyType !== "none");
}

export function contentTypeHeader(req: EffectiveRequest): string | undefined {
  const existing = req.headers.find(
    (h) => h.key.toLowerCase() === "content-type",
  );
  if (existing) return existing.value;

  switch (req.bodyType) {
    case "json":
    case "graphql":
      return "application/json";
    case "xml":
      return "application/xml";
    case "html":
      return "text/html";
    case "x-www-form-urlencoded":
      return "application/x-www-form-urlencoded";
    case "form-data":
      return undefined; // boundary set by client
    default:
      return undefined;
  }
}

/** Headers including inferred Content-Type when body is present and CT missing. */
export function headersWithContentType(
  req: EffectiveRequest,
): Array<{ key: string; value: string }> {
  const ct = contentTypeHeader(req);
  if (!ct) return [...req.headers];
  const hasCt = req.headers.some((h) => h.key.toLowerCase() === "content-type");
  if (hasCt) return [...req.headers];
  if (!hasBody(req) || req.bodyType === "form-data") return [...req.headers];
  return [...req.headers, { key: "Content-Type", value: ct }];
}
