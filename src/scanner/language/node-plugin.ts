import type { LanguagePlugin } from "../core/types";
import { readPackageJson } from "../utils/file-discovery";
import {
  expressScanner,
  fastifyScanner,
  koaScanner,
  honoScanner,
  elysiaScanner,
} from "../plugins/node/express-scanners";
import { nestjsScanner } from "../plugins/node/nestjs/nestjs-scanner";
import { nextjsScanner } from "../plugins/node/next/next-scanner";
import { bunScanner, nitroScanner } from "../plugins/node/bun/bun-scanner";

const NODE_FRAMEWORKS = [
  expressScanner,
  fastifyScanner,
  nestjsScanner,
  honoScanner,
  elysiaScanner,
  koaScanner,
  nextjsScanner,
  bunScanner,
  nitroScanner,
];

export const nodeLanguagePlugin: LanguagePlugin = {
  id: "node",
  name: "Node.js",
  async detect(ctx) {
    const pkg = ctx.packageJson ?? (await readPackageJson(ctx.fs, ctx.projectPath));
    return pkg !== null;
  },
  getFrameworkPlugins() {
    return NODE_FRAMEWORKS;
  },
};

// Future language stubs — register when implemented
// Java is implemented via `language/java-plugin.ts`
// Rust is implemented via `language/rust-plugin.ts`
// Go is implemented via `language/go-plugin.ts`
export const futureLanguagePlugins = {
  php: { id: "php", markers: ["composer.json"] },
  csharp: { id: "csharp", markers: [".csproj"] },
  ruby: { id: "ruby", markers: ["Gemfile"] },
};
