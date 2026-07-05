import type { ApiEndpoint } from "./endpoint";

export type ScanStage =
  | "detecting-language"
  | "detecting-framework"
  | "discovering-files"
  | "parsing"
  | "extracting-routes"
  | "resolving-controllers"
  | "analyzing-validation"
  | "building-collection"
  | "complete"
  | "error";

export interface ScanProgress {
  stage: ScanStage;
  message: string;
  percent: number;
  filesProcessed?: number;
  totalFiles?: number;
  routesFound?: number;
}

export interface ScanWarning {
  file?: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface ScanResult {
  projectPath: string;
  language: string;
  framework: string;
  frameworks: string[];
  endpoints: ApiEndpoint[];
  warnings: ScanWarning[];
  scannedFiles: number;
  durationMs: number;
}

export interface ScanOptions {
  projectPath: string;
  baseUrl?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFiles?: number;
  frameworks?: string[];
}
