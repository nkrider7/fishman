import type { PythonDependencies, PythonProjectInfo } from "./types";
import type { FileSystemAdapter } from "../../../core/types";

const FRAMEWORK_PACKAGES: Record<string, string> = {
  fastapi: "fastapi",
  flask: "flask",
  django: "django",
  djangorestframework: "django-rest-framework",
  litestar: "litestar",
  sanic: "sanic",
  starlette: "starlette",
  falcon: "falcon",
  tornado: "tornado",
  quart: "quart",
  blacksheep: "blacksheep",
};

const ENTRY_CANDIDATES = [
  "main.py",
  "app.py",
  "server.py",
  "run.py",
  "manage.py",
  "wsgi.py",
  "asgi.py",
  "application.py",
];

export async function detectPythonProject(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<PythonProjectInfo> {
  const warnings: string[] = [];
  const dependencies = await readPythonDependencies(fs, projectPath, warnings);
  const framework = detectFramework(dependencies);
  const pythonVersion = await readPythonVersion(fs, projectPath);
  const entryFiles = await findEntryFilePaths(fs, projectPath);
  const environment = await readEnvironmentHints(fs, projectPath);
  const baseUrl = environment.API_PREFIX ?? environment.BASE_URL ?? "/api";

  return {
    framework,
    projectRoot: projectPath,
    entryFiles,
    pythonVersion,
    dependencies,
    baseUrl,
    environment,
    warnings,
  };
}

function detectFramework(deps: PythonDependencies): string | null {
  if (deps.fastapi) return "fastapi";
  if (deps.flask) return "flask";
  if (deps.django || deps.djangorestframework) return "django";
  if (deps.litestar) return "litestar";
  if (deps.sanic) return "sanic";
  if (deps.starlette) return "starlette";
  if (deps.falcon) return "falcon";
  if (deps.tornado) return "tornado";
  if (deps.quart) return "quart";
  if (deps.blacksheep) return "blacksheep";
  return null;
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
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

export async function readPythonDependencies(
  fs: FileSystemAdapter,
  projectPath: string,
  warnings: string[] = [],
): Promise<PythonDependencies> {
  const deps: PythonDependencies = {};

  const reqPath = await fs.join(projectPath, "requirements.txt");
  if (await safeExists(fs, reqPath)) {
    const content = await safeReadFile(fs, reqPath);
    if (content) Object.assign(deps, parseRequirements(content));
  }

  const pyprojectPath = await fs.join(projectPath, "pyproject.toml");
  if (await safeExists(fs, pyprojectPath)) {
    const content = await safeReadFile(fs, pyprojectPath);
    if (content) Object.assign(deps, parsePyprojectToml(content));
  }

  const pipfilePath = await fs.join(projectPath, "Pipfile");
  if (await safeExists(fs, pipfilePath)) {
    const content = await safeReadFile(fs, pipfilePath);
    if (content) Object.assign(deps, parsePipfile(content));
  }

  const setupPath = await fs.join(projectPath, "setup.py");
  if (await safeExists(fs, setupPath)) {
    const content = await safeReadFile(fs, setupPath);
    if (content) {
      const installRequires = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
      if (installRequires) {
        for (const m of installRequires[1].matchAll(/["']([^"']+)["']/g)) {
          const parsed = parseRequirementLine(m[1]);
          if (parsed) deps[parsed.name] = parsed.version;
        }
      }
    }
  }

  if (Object.keys(deps).length === 0) {
    warnings.push("No Python dependencies file found (requirements.txt, pyproject.toml, Pipfile).");
  }

  return deps;
}

function parseRequirements(content: string): PythonDependencies {
  const deps: PythonDependencies = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const parsed = parseRequirementLine(trimmed);
    if (parsed) deps[parsed.name] = parsed.version;
  }
  return deps;
}

function parseRequirementLine(line: string): { name: string; version: string } | null {
  const cleaned = line.split("#")[0].trim();
  const match = cleaned.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*([<>=!~]+.*)?$/);
  if (!match) return null;
  const name = match[1].toLowerCase().replace(/-/g, "");
  const normalized = FRAMEWORK_PACKAGES[name] ? name : name.replace(/_/g, "");
  return { name: normalized, version: match[2]?.trim() ?? "*" };
}

function parsePyprojectToml(content: string): PythonDependencies {
  const deps: PythonDependencies = {};

  const projectDeps = content.match(/\[project\.dependencies\]([\s\S]*?)(?:\[|$)/);
  if (projectDeps) {
    for (const m of projectDeps[1].matchAll(/["']([^"']+)["']/g)) {
      const parsed = parseRequirementLine(m[1]);
      if (parsed) deps[parsed.name] = parsed.version;
    }
  }

  const poetryDeps = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/);
  if (poetryDeps) {
    for (const line of poetryDeps[1].split("\n")) {
      const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/);
      if (m && m[1] !== "python") {
        deps[m[1].toLowerCase().replace(/-/g, "")] = m[2];
      }
    }
  }

  const pythonMatch = content.match(/requires-python\s*=\s*["']([^"']+)["']/);
  if (pythonMatch) deps._pythonVersion = pythonMatch[1];

  return deps;
}

function parsePipfile(content: string): PythonDependencies {
  const deps: PythonDependencies = {};
  const packages = content.match(/\[packages\]([\s\S]*?)(?:\[|$)/);
  if (!packages) return deps;
  for (const line of packages[1].split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\n#]+)?/);
    if (m) deps[m[1].toLowerCase().replace(/-/g, "")] = m[2]?.trim() ?? "*";
  }
  return deps;
}

async function readPythonVersion(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<string | undefined> {
  const pyprojectPath = await fs.join(projectPath, "pyproject.toml");
  if (await safeExists(fs, pyprojectPath)) {
    const content = await safeReadFile(fs, pyprojectPath);
    const m = content?.match(/requires-python\s*=\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  const runtimePath = await fs.join(projectPath, "runtime.txt");
  if (await safeExists(fs, runtimePath)) {
    const content = (await safeReadFile(fs, runtimePath))?.trim();
    const m = content?.match(/python-(.+)/);
    if (m) return m[1];
  }
  return undefined;
}

async function findEntryFilePaths(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const name of ENTRY_CANDIDATES) {
    const p = await fs.join(projectPath, name);
    if (await safeExists(fs, p)) found.push(p);
  }
  return found;
}

async function readEnvironmentHints(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};

  // Read .env directly — Tauri forbids exists() on sensitive paths like .env
  const dotEnvPath = await fs.join(projectPath, ".env");
  const dotEnvContent = await safeReadFile(fs, dotEnvPath);
  if (dotEnvContent) {
    Object.assign(env, parseDotEnv(dotEnvContent));
  }

  for (const name of ["settings.py", "config.py", "constants.py"]) {
    for (const p of [
      await fs.join(projectPath, name),
      await fs.join(projectPath, "src", name),
    ]) {
      const content = await safeReadFile(fs, p);
      if (content) Object.assign(env, parsePythonConstants(content));
    }
  }
  return env;
}

function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

function parsePythonConstants(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const keys = ["BASE_URL", "API_PREFIX", "HOST", "PORT", "DEBUG", "ENV"];
  for (const key of keys) {
    const m = content.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"));
    if (m) env[key] = m[1];
    const m2 = content.match(new RegExp(`^${key}\\s*=\\s*(True|False|\\d+)`, "m"));
    if (m2) env[key] = m2[1];
  }
  return env;
}

export function hasPythonDependency(
  deps: PythonDependencies,
  name: string,
): boolean {
  const normalized = name.toLowerCase().replace(/-/g, "");
  return normalized in deps;
}
