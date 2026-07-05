import type { FrameworkPlugin } from "../../../core/types";
import { getAllDependencies } from "../../../utils/file-discovery";
import { scanWithRoutePatterns } from "../shared/route-scanner";

export const bunScanner: FrameworkPlugin = {
  id: "bun",
  name: "Bun Server",
  languageId: "node",
  async detect(ctx) {
    if (!ctx.packageJson) return false;
    const deps = getAllDependencies(ctx.packageJson);
    return "bun" in deps || "bun-types" in deps;
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "bun", {
      receivers: ["server", "app", "router"],
    }, (code) => code.includes("Bun.serve") || code.includes("fetch("));
  },
};

export const nitroScanner: FrameworkPlugin = {
  id: "nitro",
  name: "Nitro",
  languageId: "node",
  async detect(ctx) {
    if (!ctx.packageJson) return false;
    const deps = getAllDependencies(ctx.packageJson);
    return "nitropack" in deps || "nitro" in deps;
  },
  async scan(ctx) {
    const { nextjsScanner } = await import("../next/next-scanner");
    return nextjsScanner.scan(ctx);
  },
};
