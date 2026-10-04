import { parse as parseYaml } from "yaml";
import type { SpecFormat } from "./types";

export function looksLikeYaml(content: string, filename?: string): boolean {
  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return true;
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  return /^(openapi|swagger)\s*:/m.test(trimmed);
}

export function parseSpecContent(
  content: string,
  filename?: string,
): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Spec file is empty.");
  }

  // HTML swagger-ui pages are a common mistake for URL mode
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    throw new Error(
      "URL returned HTML (likely Swagger UI). Use the raw .json or .yaml spec URL instead.",
    );
  }

  if (looksLikeYaml(trimmed, filename)) {
    const doc = parseYaml(trimmed);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("YAML spec must be an object.");
    }
    return doc as Record<string, unknown>;
  }

  try {
    const doc = JSON.parse(trimmed) as unknown;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("JSON spec must be an object.");
    }
    return doc as Record<string, unknown>;
  } catch (error) {
    // Fallback: try YAML if JSON failed (extension-less content)
    try {
      const doc = parseYaml(trimmed);
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        throw error;
      }
      return doc as Record<string, unknown>;
    } catch {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      throw new Error(`Failed to parse OpenAPI/Swagger document: ${message}`);
    }
  }
}

export function detectSpecFormat(doc: Record<string, unknown>): {
  format: SpecFormat;
  version: string;
} {
  const openapi = doc.openapi;
  if (typeof openapi === "string" && openapi.trim()) {
    return { format: "openapi", version: openapi.trim() };
  }
  const swagger = doc.swagger;
  if (typeof swagger === "string" && swagger.trim()) {
    return { format: "swagger", version: swagger.trim() };
  }
  return { format: "unknown", version: "" };
}

export function isOpenApiOrSwagger(doc: Record<string, unknown>): boolean {
  const { format } = detectSpecFormat(doc);
  return format === "openapi" || format === "swagger";
}
