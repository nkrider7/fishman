import type { FileSystemAdapter } from "../../../core/types";
import type { RustDependencies, RustProjectInfo } from "./types";

const ACTIX_CRATES = ["actix-web", "actix_web"];
const AXUM_CRATES = ["axum"];

export async function detectRustProject(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<RustProjectInfo> {
  const warnings: string[] = [];
  const dependencies = await readCargoDependencies(fs, projectPath, warnings);
  const workspaceMembers = await readWorkspaceMembers(fs, projectPath);
  const sourceRoots = await discoverRustSourceRoots(fs, projectPath);

  return {
    dependencies,
    workspaceMembers,
    sourceRoots,
    warnings,
    projectRoot: projectPath,
  };
}

export function hasRustDependency(
  deps: RustDependencies,
  crateName: string,
): boolean {
  const normalized = crateName.toLowerCase().replace(/_/g, "-");
  return Object.keys(deps).some(
    (key) => key.toLowerCase().replace(/_/g, "-") === normalized,
  );
}

export function hasActixDependency(deps: RustDependencies): boolean {
  return ACTIX_CRATES.some((c) => hasRustDependency(deps, c));
}

export function hasAxumDependency(deps: RustDependencies): boolean {
  return AXUM_CRATES.some((c) => hasRustDependency(deps, c));
}

async function readCargoDependencies(
  fs: FileSystemAdapter,
  projectPath: string,
  warnings: string[],
): Promise<RustDependencies> {
  const deps: RustDependencies = {};
  const cargoPath = await fs.join(projectPath, "Cargo.toml");
  const content = await safeReadFile(fs, cargoPath);
  if (content) {
    Object.assign(deps, parseCargoDependencies(content));
  } else {
    warnings.push("No Cargo.toml found at project root.");
  }

  // Workspace member crates (shallow)
  const members = content ? parseWorkspaceMembers(content) : [];
  for (const member of members.slice(0, 8)) {
    const memberPath = await fs.join(projectPath, member, "Cargo.toml");
    const memberContent = await safeReadFile(fs, memberPath);
    if (memberContent) {
      Object.assign(deps, parseCargoDependencies(memberContent));
    }
  }

  return deps;
}

async function readWorkspaceMembers(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<string[]> {
  const cargoPath = await fs.join(projectPath, "Cargo.toml");
  const content = await safeReadFile(fs, cargoPath);
  if (!content) return [];
  return parseWorkspaceMembers(content);
}

async function discoverRustSourceRoots(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<string[]> {
  const roots: string[] = [];
  const src = await fs.join(projectPath, "src");
  if (await safeExists(fs, src)) roots.push(src);
  return roots;
}

export function parseCargoDependencies(content: string): RustDependencies {
  const deps: RustDependencies = {};
  const sections = ["dependencies", "dev-dependencies", "build-dependencies"];

  for (const section of sections) {
    const sectionRegex = new RegExp(
      `\\[${section.replace("-", "\\-")}\\]([\\s\\S]*?)(?=\\n\\[|$)`,
      "i",
    );
    const match = content.match(sectionRegex);
    if (!match) continue;

    const body = match[1];
    // Simple key = "version" or key = { version = "..." }
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const simple = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
      if (simple) {
        deps[simple[1]] = simple[2];
        continue;
      }

      const inline = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{/);
      if (inline) {
        const versionMatch = trimmed.match(/version\s*=\s*"([^"]+)"/);
        deps[inline[1]] = versionMatch?.[1] ?? "*";
      }
    }
  }

  return deps;
}

export function parseWorkspaceMembers(content: string): string[] {
  const match = content.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  const members: string[] = [];
  for (const part of match[1].split(",")) {
    const cleaned = part.trim().replace(/^["']|["']$/g, "");
    if (cleaned && !cleaned.includes("*")) members.push(cleaned);
  }
  return members;
}

async function safeExists(
  fs: FileSystemAdapter,
  path: string,
): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

async function safeReadFile(
  fs: FileSystemAdapter,
  path: string,
): Promise<string | null> {
  try {
    if (!(await safeExists(fs, path))) return null;
    return await fs.readFile(path);
  } catch {
    return null;
  }
}
