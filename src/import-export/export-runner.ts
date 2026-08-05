import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  exportCollectionContent,
  importExportRegistry,
  type CollectionExportData,
  type ExportOptions,
} from "@/import-export";
import type { Environment } from "@/types/environment";

export interface RunCollectionExportParams {
  formatId: string;
  exportData: CollectionExportData;
  environments?: Environment[];
  options: ExportOptions;
}

export type RunCollectionExportResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" };

/**
 * Serialize a collection via the plugin registry and prompt the user to save it.
 * Shared by ExportDialog and ShareCollectionDialog.
 */
export async function runCollectionExport(
  params: RunCollectionExportParams,
): Promise<RunCollectionExportResult> {
  const exporter = importExportRegistry.getExporter(params.formatId);
  if (!exporter) {
    throw new Error(`Unsupported export format: ${params.formatId}`);
  }

  const content = exportCollectionContent(params.formatId, {
    data: {
      ...params.exportData,
      variables: params.exportData.variables ?? [],
      environments: params.environments ?? params.exportData.environments ?? [],
    },
    options: params.options,
  });

  const defaultName = `${params.exportData.rootFolder.name}.${exporter.defaultExtension}`;
  const ext = exporter.defaultExtension.includes(".")
    ? exporter.defaultExtension.split(".").pop()!
    : exporter.defaultExtension;

  return saveTextFile({
    content,
    defaultPath: defaultName,
    filterName: exporter.name,
    extensions: [ext],
  });
}

export async function saveTextFile(params: {
  content: string;
  defaultPath: string;
  filterName: string;
  extensions: string[];
}): Promise<RunCollectionExportResult> {
  const path = await save({
    filters: [
      {
        name: params.filterName,
        extensions: params.extensions,
      },
    ],
    defaultPath: params.defaultPath,
  });

  if (!path) return { status: "cancelled" };

  await writeTextFile(path, params.content);
  return { status: "saved", path };
}

export const FUTURE_SHARE_FORMATS = [
  {
    id: "bruno",
    label: "Bruno",
    description: "Export for Bruno",
  },
  {
    id: "openapi",
    label: "OpenAPI Specification",
    description: "Export as OpenAPI spec",
  },
  {
    id: "har",
    label: "HAR",
    description: "HTTP Archive format",
  },
  {
    id: "insomnia",
    label: "Insomnia",
    description: "Export for Insomnia",
  },
] as const;
