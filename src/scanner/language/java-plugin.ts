import type { LanguagePlugin } from "../core/types";
import { springBootScanner } from "../plugins/java/spring-boot/spring-boot-scanner";

const JAVA_FRAMEWORKS = [springBootScanner];

const JAVA_MARKERS = [
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
];

export const javaLanguagePlugin: LanguagePlugin = {
  id: "java",
  name: "Java",
  async detect(ctx) {
    for (const marker of JAVA_MARKERS) {
      const markerPath = await ctx.fs.join(ctx.projectPath, marker);
      if (await safeExists(ctx.fs, markerPath)) return true;
    }

    // Nested module markers (one level)
    try {
      const entries = await ctx.fs.readDir(ctx.projectPath);
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (["target", "build", ".git", ".gradle", "node_modules", "src"].includes(entry.name)) {
          continue;
        }
        for (const marker of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
          const nested = await ctx.fs.join(ctx.projectPath, entry.name, marker);
          if (await safeExists(ctx.fs, nested)) return true;
        }
      }
    } catch {
      // ignore
    }

    // Fallback: classic Maven/Gradle layout
    const mainJava = await ctx.fs.join(ctx.projectPath, "src", "main", "java");
    if (await safeExists(ctx.fs, mainJava)) return true;

    return false;
  },
  getFrameworkPlugins() {
    return JAVA_FRAMEWORKS;
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
