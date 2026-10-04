import { buildCollectionFromEndpoints } from "@/scanner/builders/collection-builder";
import { buildScanMetaFromEndpoint } from "@/scan-drift/identity";
import type { ImportResult, ImportWarning } from "@/import-export/core/types";
import { generateId } from "@/utils/id";
import { parseSpecContent } from "./parse";
import { parseOpenApiToEndpoints } from "./normalize";
import type { SpecParseResult } from "./types";

export function parseSpecDocument(
  content: string,
  filename?: string,
): SpecParseResult {
  const doc = parseSpecContent(content, filename);
  return parseOpenApiToEndpoints(doc, {
    sourceLabel: filename ?? "openapi",
  });
}

export function mapSpecToImportResult(
  content: string,
  filename?: string,
  options?: { baseUrl?: string; collectionName?: string },
): ImportResult {
  return endpointsToImportResult(parseSpecDocument(content, filename), options);
}

export function endpointsToImportResult(
  parsed: SpecParseResult,
  options?: { baseUrl?: string; collectionName?: string },
): ImportResult {
  const collectionName =
    options?.collectionName?.trim() ||
    parsed.document.title ||
    "OpenAPI Collection";

  const scanned = buildCollectionFromEndpoints(parsed.endpoints, {
    collectionName,
    baseUrl: "{{baseUrl}}",
  });

  const absoluteBase = options?.baseUrl ?? parsed.document.baseUrl;
  const variables = [
    {
      id: generateId(),
      key: "baseUrl",
      value:
        absoluteBase && !absoluteBase.includes("{{")
          ? absoluteBase
          : absoluteBase || "http://localhost",
      enabled: true,
    },
  ];

  const warnings: ImportWarning[] = parsed.warnings.map((message) => ({
    message,
  }));

  return {
    rootFolder: scanned.rootFolder,
    folders: scanned.folders,
    requests: scanned.requests.map((r) => ({
      id: r.id,
      collection_id: r.collection_id,
      name: r.name,
      draft: {
        ...r.draft,
        scan: buildScanMetaFromEndpoint(r.endpoint, "openapi"),
      },
      sort_order: r.sort_order,
    })),
    variables,
    warnings,
  };
}
