import type { ExportPlugin, ImportPlugin } from "./types";

class ImportExportRegistry {
  private importers: ImportPlugin[] = [];
  private exporters: ExportPlugin[] = [];

  registerImporter(plugin: ImportPlugin): void {
    if (this.importers.some((p) => p.id === plugin.id)) return;
    this.importers.push(plugin);
  }

  registerExporter(plugin: ExportPlugin): void {
    if (this.exporters.some((p) => p.id === plugin.id)) return;
    this.exporters.push(plugin);
  }

  getImporters(): ImportPlugin[] {
    return [...this.importers];
  }

  getExporters(): ExportPlugin[] {
    return [...this.exporters];
  }

  getImporter(id: string): ImportPlugin | undefined {
    return this.importers.find((p) => p.id === id);
  }

  getExporter(id: string): ExportPlugin | undefined {
    return this.exporters.find((p) => p.id === id);
  }

  detectImporter(content: string, filename?: string): ImportPlugin | null {
    for (const plugin of this.importers) {
      try {
        if (plugin.detect(content, filename)) return plugin;
      } catch {
        // try next
      }
    }
    return null;
  }
}

export const importExportRegistry = new ImportExportRegistry();
