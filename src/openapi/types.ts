import type { ApiEndpoint } from "@/scanner/models/endpoint";

export type SpecSource = "file" | "url";

/** Durable link between a collection root and an OpenAPI/Swagger spec. */
export interface SpecLink {
  collectionRootId: string;
  source: SpecSource;
  filePath?: string;
  specUrl?: string;
  lastSyncAt: number;
  lastSpecFingerprint: string;
  baseUrl?: string;
  specVersion?: string;
  title?: string;
  collectionName?: string;
}

export type SpecFormat = "openapi" | "swagger" | "unknown";

export interface ParsedSpecDocument {
  format: SpecFormat;
  version: string;
  title: string;
  baseUrl?: string;
  raw: Record<string, unknown>;
  warnings: string[];
}

export interface SpecParseResult {
  document: ParsedSpecDocument;
  endpoints: ApiEndpoint[];
  warnings: string[];
}

export interface LoadSpecInput {
  source: SpecSource;
  filePath?: string;
  specUrl?: string;
  content: string;
  filename?: string;
}
