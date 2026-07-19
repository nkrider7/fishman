import type { FileSystemAdapter } from "../../../core/types";
import type { JavaDependencies, JavaProjectInfo } from "./types";
import { discoverSourceRoots } from "../../../utils/java-file-discovery";

const SPRING_ARTIFACT_HINTS = [
  "spring-boot-starter-web",
  "spring-boot-starter-webflux",
  "spring-boot-starter",
  "spring-web",
  "spring-webmvc",
  "spring-webflux",
];

export async function detectJavaProject(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<JavaProjectInfo> {
  const warnings: string[] = [];
  const buildSystem = await detectBuildSystem(fs, projectPath);
  const dependencies = await readJavaDependencies(fs, projectPath, buildSystem, warnings);
  const springBootVersion = findSpringBootVersion(dependencies);
  const { contextPath, servletPath } = await readApplicationConfig(fs, projectPath);
  const sourceRoots = await discoverSourceRoots(fs, projectPath);
  const entryClasses = await findSpringBootApplications(fs, projectPath, sourceRoots);

  return {
    buildSystem,
    dependencies,
    springBootVersion,
    contextPath,
    servletPath,
    entryClasses,
    sourceRoots,
    warnings,
    projectRoot: projectPath,
  };
}

async function detectBuildSystem(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<JavaProjectInfo["buildSystem"]> {
  if (await safeExists(fs, await fs.join(projectPath, "pom.xml"))) return "maven";
  if (
    (await safeExists(fs, await fs.join(projectPath, "build.gradle"))) ||
    (await safeExists(fs, await fs.join(projectPath, "build.gradle.kts")))
  ) {
    return "gradle";
  }
  return "unknown";
}

export async function readJavaDependencies(
  fs: FileSystemAdapter,
  projectPath: string,
  buildSystem: JavaProjectInfo["buildSystem"],
  warnings: string[] = [],
): Promise<JavaDependencies> {
  const deps: JavaDependencies = {};

  if (buildSystem === "maven" || buildSystem === "unknown") {
    const pomPath = await fs.join(projectPath, "pom.xml");
    const content = await safeReadFile(fs, pomPath);
    if (content) Object.assign(deps, parsePomDependencies(content));

    // Nested module poms (shallow)
    await collectNestedPoms(fs, projectPath, deps, 0);
  }

  if (buildSystem === "gradle" || buildSystem === "unknown") {
    for (const name of ["build.gradle", "build.gradle.kts"]) {
      const gradlePath = await fs.join(projectPath, name);
      const content = await safeReadFile(fs, gradlePath);
      if (content) Object.assign(deps, parseGradleDependencies(content));
    }
    await collectNestedGradles(fs, projectPath, deps, 0);
  }

  if (Object.keys(deps).length === 0) {
    warnings.push("No Maven/Gradle dependencies parsed from project manifests.");
  }

  return deps;
}

async function collectNestedPoms(
  fs: FileSystemAdapter,
  dir: string,
  deps: JavaDependencies,
  depth: number,
): Promise<void> {
  if (depth > 3) return;
  let entries: import("../../../core/types").FsDirEntry[];
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    if (["target", "build", ".git", ".gradle", "node_modules"].includes(entry.name)) continue;
    const child = await fs.join(dir, entry.name);
    const pom = await fs.join(child, "pom.xml");
    const content = await safeReadFile(fs, pom);
    if (content) Object.assign(deps, parsePomDependencies(content));
    await collectNestedPoms(fs, child, deps, depth + 1);
  }
}

async function collectNestedGradles(
  fs: FileSystemAdapter,
  dir: string,
  deps: JavaDependencies,
  depth: number,
): Promise<void> {
  if (depth > 3) return;
  let entries: import("../../../core/types").FsDirEntry[];
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    if (["target", "build", ".git", ".gradle", "node_modules"].includes(entry.name)) continue;
    const child = await fs.join(dir, entry.name);
    for (const name of ["build.gradle", "build.gradle.kts"]) {
      const content = await safeReadFile(fs, await fs.join(child, name));
      if (content) Object.assign(deps, parseGradleDependencies(content));
    }
    await collectNestedGradles(fs, child, deps, depth + 1);
  }
}

export function parsePomDependencies(content: string): JavaDependencies {
  const deps: JavaDependencies = {};

  const parentBlock = content.match(/<parent>([\s\S]*?)<\/parent>/);
  if (parentBlock) {
    const body = parentBlock[1];
    const groupId = body.match(/<groupId>\s*([^<]+)\s*<\/groupId>/)?.[1]?.trim();
    const artifactId = body.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/)?.[1]?.trim();
    const version = body.match(/<version>\s*([^<]+)\s*<\/version>/)?.[1]?.trim() ?? "*";
    if (artifactId) {
      if (groupId) deps[`${groupId}:${artifactId}`] = version;
      deps[artifactId] = version;
    }
  }

  for (const block of content.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const body = block[1];
    const groupId = body.match(/<groupId>\s*([^<]+)\s*<\/groupId>/)?.[1]?.trim();
    const artifactId = body.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/)?.[1]?.trim();
    const version = body.match(/<version>\s*([^<]+)\s*<\/version>/)?.[1]?.trim() ?? "*";
    if (!artifactId) continue;
    const key = groupId ? `${groupId}:${artifactId}` : artifactId;
    deps[key] = version;
    deps[artifactId] = version;
  }

  return deps;
}

export function parseGradleDependencies(content: string): JavaDependencies {
  const deps: JavaDependencies = {};

  // plugins { id 'org.springframework.boot' version '3.x' }
  const pluginVersion = content.match(
    /id\s*\(?\s*['"]org\.springframework\.boot['"]\s*\)?\s*version\s+['"]([^'"]+)['"]/,
  );
  if (pluginVersion) {
    deps["org.springframework.boot:spring-boot"] = pluginVersion[1];
    deps["spring-boot"] = pluginVersion[1];
  }

  const patterns = [
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|compile)\s*\(?\s*['"]([^'"]+)['"]\s*\)?/g,
    /(?:implementation|api|compileOnly|runtimeOnly)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      const coord = match[1].trim();
      const parts = coord.split(":");
      if (parts.length >= 2) {
        const groupId = parts[0];
        const artifactId = parts[1];
        const version = parts[2] ?? "*";
        deps[`${groupId}:${artifactId}`] = version;
        deps[artifactId] = version;
      } else if (coord) {
        deps[coord] = "*";
      }
    }
  }

  return deps;
}

function findSpringBootVersion(deps: JavaDependencies): string | undefined {
  for (const [key, version] of Object.entries(deps)) {
    if (
      key.includes("spring-boot-starter-parent") ||
      key === "org.springframework.boot:spring-boot" ||
      key === "spring-boot"
    ) {
      if (version && version !== "*") return version;
    }
  }
  return undefined;
}

export function hasSpringDependency(deps: JavaDependencies): boolean {
  return Object.keys(deps).some((key) => {
    const lower = key.toLowerCase();
    return (
      SPRING_ARTIFACT_HINTS.some((h) => lower.includes(h)) ||
      lower.includes("springframework.boot") ||
      lower.includes("spring-boot")
    );
  });
}

export function hasJavaDependency(deps: JavaDependencies, artifactHint: string): boolean {
  const needle = artifactHint.toLowerCase();
  return Object.keys(deps).some((key) => key.toLowerCase().includes(needle));
}

async function readApplicationConfig(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<{ contextPath?: string; servletPath?: string }> {
  const candidates = [
    await fs.join(projectPath, "src", "main", "resources", "application.yml"),
    await fs.join(projectPath, "src", "main", "resources", "application.yaml"),
    await fs.join(projectPath, "src", "main", "resources", "application.properties"),
    await fs.join(projectPath, "application.yml"),
    await fs.join(projectPath, "application.yaml"),
    await fs.join(projectPath, "application.properties"),
  ];

  // Also check nested modules one level deep
  try {
    const entries = await fs.readDir(projectPath);
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (["target", "build", ".git", ".gradle", "src"].includes(entry.name)) continue;
      const moduleRoot = await fs.join(projectPath, entry.name);
      candidates.push(
        await fs.join(moduleRoot, "src", "main", "resources", "application.yml"),
      );
      candidates.push(
        await fs.join(moduleRoot, "src", "main", "resources", "application.properties"),
      );
    }
  } catch {
    // ignore
  }

  let contextPath: string | undefined;
  let servletPath: string | undefined;

  for (const path of candidates) {
    const content = await safeReadFile(fs, path);
    if (!content) continue;
    const parsed = path.endsWith(".properties")
      ? parsePropertiesConfig(content)
      : parseYamlConfig(content);
    contextPath ??= parsed.contextPath;
    servletPath ??= parsed.servletPath;
    if (contextPath || servletPath) break;
  }

  return { contextPath, servletPath };
}

export function parsePropertiesConfig(content: string): {
  contextPath?: string;
  servletPath?: string;
} {
  let contextPath: string | undefined;
  let servletPath: string | undefined;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "server.servlet.context-path") contextPath = value;
    if (key === "spring.mvc.servlet.path") servletPath = value;
  }
  return { contextPath, servletPath };
}

export function parseYamlConfig(content: string): {
  contextPath?: string;
  servletPath?: string;
} {
  // Lightweight YAML key scrape — enough for Spring Boot common keys
  const context =
    content.match(/server:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+servlet:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+context-path:\s*["']?([^\s"'#]+)/) ??
    content.match(/context-path:\s*["']?([^\s"'#]+)/);
  const servlet =
    content.match(/spring:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+mvc:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+servlet:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+path:\s*["']?([^\s"'#]+)/) ??
    content.match(/spring\.mvc\.servlet\.path:\s*["']?([^\s"'#]+)/);

  return {
    contextPath: context?.[1],
    servletPath: servlet?.[1],
  };
}

async function findSpringBootApplications(
  fs: FileSystemAdapter,
  projectPath: string,
  sourceRoots: string[],
): Promise<string[]> {
  const found: string[] = [];
  const roots = sourceRoots.length > 0 ? sourceRoots : [projectPath];

  for (const root of roots) {
    await walkForAnnotation(fs, root, "@SpringBootApplication", found, 0);
  }
  return found;
}

async function walkForAnnotation(
  fs: FileSystemAdapter,
  dir: string,
  annotation: string,
  out: string[],
  depth: number,
): Promise<void> {
  if (depth > 12 || out.length >= 20) return;
  let entries: import("../../../core/types").FsDirEntry[];
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= 20) break;
    const full = await fs.join(dir, entry.name);
    if (entry.isDirectory) {
      if (["target", "build", ".git", "test"].includes(entry.name)) continue;
      await walkForAnnotation(fs, full, annotation, out, depth + 1);
      continue;
    }
    if (!entry.name.endsWith(".java")) continue;
    const content = await safeReadFile(fs, full);
    if (content?.includes(annotation)) {
      const classMatch = content.match(/(?:public\s+)?(?:final\s+)?class\s+(\w+)/);
      if (classMatch) out.push(classMatch[1]);
    }
  }
}

async function safeExists(fs: FileSystemAdapter, path: string): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

async function safeReadFile(fs: FileSystemAdapter, path: string): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}
