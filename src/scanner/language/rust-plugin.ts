import type { LanguagePlugin } from "../core/types";
import { actixScanner } from "../plugins/rust/actix/actix-scanner";
import { axumScanner } from "../plugins/rust/axum/axum-scanner";

const RUST_FRAMEWORKS = [actixScanner, axumScanner];

const RUST_MARKERS = ["Cargo.toml"];

export const rustLanguagePlugin: LanguagePlugin = {
  id: "rust",
  name: "Rust",
  async detect(ctx) {
    for (const marker of RUST_MARKERS) {
      const markerPath = await ctx.fs.join(ctx.projectPath, marker);
      if (await safeExists(ctx.fs, markerPath)) return true;
    }

    // Workspace member with Cargo.toml (one level)
    try {
      const entries = await ctx.fs.readDir(ctx.projectPath);
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (["target", ".git", "node_modules", "src"].includes(entry.name)) continue;
        const nested = await ctx.fs.join(ctx.projectPath, entry.name, "Cargo.toml");
        if (await safeExists(ctx.fs, nested)) return true;
      }
    } catch {
      // ignore
    }

    // Classic Rust layout
    const srcMain = await ctx.fs.join(ctx.projectPath, "src", "main.rs");
    if (await safeExists(ctx.fs, srcMain)) return true;

    return false;
  },
  getFrameworkPlugins() {
    return RUST_FRAMEWORKS;
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
