import type { CollectionExportData } from "@/import-export/core/types";
import { mapCollectionToOpenCollection } from "./map-collection-to-docs";
import { buildDocumentationHtmlShell } from "./html-template";
import type { DocsGenerateOptions } from "./types";
import { dumpOpenCollectionYaml, escapeYamlForJsString } from "./yaml";

export function sanitizeDocsFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "collection";
}

/**
 * Build a standalone documentation HTML file from a Fishman collection export.
 */
export function buildDocumentationHtml(
  data: CollectionExportData,
  options: DocsGenerateOptions = {},
): string {
  const doc = mapCollectionToOpenCollection(data, {
    includeSecrets: false,
    ...options,
  });
  const yaml = dumpOpenCollectionYaml(doc);
  const escaped = escapeYamlForJsString(yaml);
  return buildDocumentationHtmlShell({
    collectionName: data.rootFolder.name,
    escapedYamlJsLiteral: escaped,
    theme: options.theme ?? "light",
  });
}

export function documentationDefaultFileName(collectionName: string): string {
  return `${sanitizeDocsFileName(collectionName)}-documentation.html`;
}
