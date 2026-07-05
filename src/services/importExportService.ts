/**
 * @deprecated Use `@/import-export` instead. Re-exported for backward compatibility.
 */
export type { ImportResult } from "@/import-export/core/types";
export {
  buildImportPreview,
  importCollectionContent,
  exportCollectionContent,
  detectImportFormat,
} from "@/import-export/core/service";

import type { ImportResult } from "@/import-export/core/types";
import { importCollectionContent } from "@/import-export/core/service";
import type { CollectionFolder } from "@/types/collection";
import { exportCollectionContent } from "@/import-export/core/service";
import { assembleCollectionExportData } from "@/import-export/core/assemble";
import { rowToRequest } from "@/services/dbService";
import type { SavedRequest } from "@/types/collection";

/** @deprecated Use importCollectionContent from @/import-export */
export function parsePostmanCollection(json: unknown): ImportResult {
  const content =
    typeof json === "string" ? json : JSON.stringify(json);
  return importCollectionContent(content, undefined, "postman").result;
}

/** @deprecated Use exportCollectionContent from @/import-export */
export function exportCollectionJson(
  rootFolder: CollectionFolder,
  folders: CollectionFolder[],
  requests: SavedRequest[],
  format: "postman" | "fishman" = "postman",
): string {
  const data = assembleCollectionExportData(
    rootFolder.id,
    folders,
    requests,
    rowToRequest,
  );
  if (!data) return "{}";
  return exportCollectionContent(format, { data, options: {} });
}
