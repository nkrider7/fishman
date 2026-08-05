import type { LanguagePlugin } from "../core/types";
import { ginScanner } from "../plugins/go/gin/gin-scanner";
import { echoScanner } from "../plugins/go/echo/echo-scanner";
import { chiScanner } from "../plugins/go/chi/chi-scanner";
import { netHttpScanner } from "../plugins/go/nethttp/nethttp-scanner";

const GO_FRAMEWORKS = [ginScanner, echoScanner, chiScanner, netHttpScanner];

const GO_MARKERS = ["go.mod"];

export const goLanguagePlugin: LanguagePlugin = {
  id: "go",
  name: "Go",
  async detect(ctx) {
    for (const marker of GO_MARKERS) {
      const markerPath = await ctx.fs.join(ctx.projectPath, marker);
      if (await safeExists(ctx.fs, markerPath)) return true;
    }

    // Nested module (one level)
    try {
      const entries = await ctx.fs.readDir(ctx.projectPath);
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (["vendor", ".git", "node_modules", "bin"].includes(entry.name)) continue;
        const nested = await ctx.fs.join(ctx.projectPath, entry.name, "go.mod");
        if (await safeExists(ctx.fs, nested)) return true;
      }
    } catch {
      // ignore
    }

    return false;
  },
  getFrameworkPlugins() {
    return GO_FRAMEWORKS;
  },
};

async function safeExists(
  fs: { exists(path: string): Promise<boolean> },
  path: string,
): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}
