import type { ImportResult } from "@/import-export/core/types";
import { fingerprintSpecEndpoints } from "./fingerprint";
import { mapSpecToImportResult, parseSpecDocument } from "./map-to-import";
import type { SpecLink, SpecSource } from "./types";

export interface ConnectSpecResult {
  importResult: ImportResult;
  linkDraft: Omit<SpecLink, "collectionRootId">;
  title: string;
  endpointCount: number;
  warnings: string[];
}

export function prepareConnectFromContent(input: {
  content: string;
  filename?: string;
  source: SpecSource;
  filePath?: string;
  specUrl?: string;
}): ConnectSpecResult {
  const parsed = parseSpecDocument(input.content, input.filename);
  const importResult = mapSpecToImportResult(input.content, input.filename);
  const fingerprint = fingerprintSpecEndpoints(parsed.endpoints);

  return {
    importResult,
    title: parsed.document.title,
    endpointCount: parsed.endpoints.length,
    warnings: [
      ...parsed.warnings,
      ...(importResult.warnings?.map((w) => w.message) ?? []),
    ],
    linkDraft: {
      source: input.source,
      filePath: input.filePath,
      specUrl: input.specUrl,
      lastSyncAt: Date.now(),
      lastSpecFingerprint: fingerprint,
      baseUrl: parsed.document.baseUrl,
      specVersion: `${parsed.document.format === "swagger" ? "swagger" : "openapi"} ${parsed.document.version}`,
      title: parsed.document.title,
      collectionName: parsed.document.title,
    },
  };
}
