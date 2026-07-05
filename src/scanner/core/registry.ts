import type {
  FrameworkPlugin,
  LanguagePlugin,
  ScannerPluginRegistry,
  DetectionContext,
} from "./types";

class PluginRegistry implements ScannerPluginRegistry {
  private languages: LanguagePlugin[] = [];

  registerLanguage(plugin: LanguagePlugin): void {
    if (this.languages.some((l) => l.id === plugin.id)) return;
    this.languages.push(plugin);
  }

  getLanguages(): LanguagePlugin[] {
    return [...this.languages];
  }

  async detectLanguage(
    ctx: DetectionContext,
  ): Promise<LanguagePlugin | null> {
    for (const plugin of this.languages) {
      try {
        if (await plugin.detect(ctx)) return plugin;
      } catch {
        // continue
      }
    }
    return null;
  }

  async detectFrameworks(
    language: LanguagePlugin,
    ctx: DetectionContext,
  ): Promise<FrameworkPlugin[]> {
    const detected: FrameworkPlugin[] = [];
    for (const framework of language.getFrameworkPlugins()) {
      try {
        if (await framework.detect(ctx)) detected.push(framework);
      } catch {
        // continue
      }
    }
    return detected;
  }
}

export const scannerRegistry = new PluginRegistry();

export function createRegistry(): ScannerPluginRegistry {
  return new PluginRegistry();
}
