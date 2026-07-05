import { getTopLevelFolderNames } from "./assemble";
import { importExportRegistry } from "./registry";
import type {
  ExportOptions,
  ImportError,
  ImportOptions,
  ImportPreview,
  ImportResult,
} from "./types";
import { fishmanImporter } from "../plugins/fishman-importer";
import { fishmanExporter } from "../plugins/fishman-exporter";
import { postmanImporter } from "../plugins/postman-importer";
import { postmanExporter } from "../plugins/postman-exporter";

importExportRegistry.registerImporter(fishmanImporter);
importExportRegistry.registerImporter(postmanImporter);
importExportRegistry.registerExporter(fishmanExporter);
importExportRegistry.registerExporter(postmanExporter);

export function detectImportFormat(
  content: string,
  filename?: string,
): string | null {
  return importExportRegistry.detectImporter(content, filename)?.id ?? null;
}

export function buildImportPreview(
  content: string,
  filename?: string,
  formatId?: string,
): ImportPreview {
  const plugin = formatId
    ? importExportRegistry.getImporter(formatId)
    : importExportRegistry.detectImporter(content, filename);

  if (!plugin) {
    return {
      formatId: "unknown",
      formatLabel: "Unknown",
      collectionName: "",
      folderCount: 0,
      requestCount: 0,
      variableCount: 0,
      folderNames: [],
      warnings: [],
      errors: [
        {
          message: "Unsupported or unrecognized collection format.",
          suggestion:
            "Import a Fishman (.fishman.json) or Postman Collection v2/v2.1 file.",
        },
      ],
      result: null,
    };
  }

  const errors = plugin.validate(content);
  if (errors.length > 0) {
    return {
      formatId: plugin.id,
      formatLabel: plugin.name,
      collectionName: "",
      folderCount: 0,
      requestCount: 0,
      variableCount: 0,
      folderNames: [],
      warnings: [],
      errors,
      result: null,
    };
  }

  try {
    const result = plugin.parse(content);
    const folderNames = getTopLevelFolderNames(
      result.rootFolder.id,
      result.folders,
    );

    return {
      formatId: plugin.id,
      formatLabel: plugin.name,
      collectionName: result.rootFolder.name,
      folderCount: result.folders.length,
      requestCount: result.requests.length,
      variableCount: result.variables?.length ?? 0,
      folderNames,
      warnings: result.warnings ?? [],
      errors: [],
      result,
    };
  } catch (error) {
    return {
      formatId: plugin.id,
      formatLabel: plugin.name,
      collectionName: "",
      folderCount: 0,
      requestCount: 0,
      variableCount: 0,
      folderNames: [],
      warnings: [],
      errors: [
        {
          message: error instanceof Error ? error.message : "Import failed",
          suggestion: "Check the file structure and try again.",
        },
      ],
      result: null,
    };
  }
}

export function importCollectionContent(
  content: string,
  filename?: string,
  formatId?: string,
  _options?: ImportOptions,
): { result: ImportResult; preview: ImportPreview } {
  const preview = buildImportPreview(content, filename, formatId);
  if (preview.errors.length > 0 || !preview.result) {
    const error = preview.errors[0];
    throw new Error(error?.message ?? "Import failed");
  }
  return { result: preview.result, preview };
}

export function exportCollectionContent(
  formatId: string,
  ctx: Parameters<NonNullable<ReturnType<typeof importExportRegistry.getExporter>>["serialize"]>[0],
): string {
  const exporter = importExportRegistry.getExporter(formatId);
  if (!exporter) {
    throw new Error(`Unsupported export format: ${formatId}`);
  }
  return exporter.serialize(ctx);
}

export {
  importExportRegistry,
  fishmanImporter,
  fishmanExporter,
  postmanImporter,
  postmanExporter,
};

export type { ImportResult, ImportPreview, ImportError, ExportOptions };
