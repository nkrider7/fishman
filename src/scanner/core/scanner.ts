import type { FileSystemAdapter, ScannerPluginRegistry } from "./types";
import type { ScanResult, ScanWarning } from "../models/scan-result";
import type { ApiEndpoint } from "../models/endpoint";
import type { ScanRunOptions } from "./scan-options";
import { readPackageJson } from "../utils/file-discovery";
import { scannerRegistry } from "./registry";
import { nodeLanguagePlugin } from "../language/node-plugin";
import { pythonLanguagePlugin } from "../language/python-plugin";
import { javaLanguagePlugin } from "../language/java-plugin";
import { detectPythonProject } from "../plugins/python/shared/project-detector";
import { detectJavaProject } from "../plugins/java/shared/project-detector";
import { detectRustProject } from "../plugins/rust/shared/project-detector";
import { rustLanguagePlugin } from "../language/rust-plugin";
import { detectGoProject } from "../plugins/go/shared/project-detector";
import { goLanguagePlugin } from "../language/go-plugin";

let initialized = false;

export function initializeScanner(
  registry: ScannerPluginRegistry = scannerRegistry,
): void {
  if (initialized) return;
  // Order: prefer explicit manifests. Python/Java/Rust/Go before Node so a monorepo
  // with package.json + pom.xml / Cargo.toml / go.mod still classifies by folder markers.
  registry.registerLanguage(pythonLanguagePlugin);
  registry.registerLanguage(javaLanguagePlugin);
  registry.registerLanguage(rustLanguagePlugin);
  registry.registerLanguage(goLanguagePlugin);
  registry.registerLanguage(nodeLanguagePlugin);
  initialized = true;
}

export async function scanProject(
  fs: FileSystemAdapter,
  options: ScanRunOptions,
  registry: ScannerPluginRegistry = scannerRegistry,
): Promise<ScanResult> {
  initializeScanner(registry);
  const start = Date.now();
  const warnings: ScanWarning[] = [];

  options.onProgress?.({
    stage: "detecting-language",
    message: "Detecting project language...",
    percent: 5,
  });

  const packageJson = (await readPackageJson(fs, options.projectPath)) ?? {};
  let detectionCtx: import("./types").DetectionContext = {
    projectPath: options.projectPath,
    fs,
    packageJson,
  };

  const language = await registry.detectLanguage(detectionCtx);
  if (!language) {
    return {
      projectPath: options.projectPath,
      language: "unknown",
      framework: "unknown",
      frameworks: [],
      endpoints: [],
      warnings: [
        {
          message:
            "Could not detect project language. Supported: Python (requirements.txt, pyproject.toml), Java (pom.xml / Gradle), Rust (Cargo.toml), Go (go.mod), and Node.js (package.json).",
          severity: "error",
        },
      ],
      scannedFiles: 0,
      durationMs: Date.now() - start,
    };
  }

  if (language.id === "python") {
    const pythonProjectInfo = await detectPythonProject(fs, options.projectPath);
    detectionCtx = {
      ...detectionCtx,
      pythonProject: {
        dependencies: pythonProjectInfo.dependencies,
        pythonVersion: pythonProjectInfo.pythonVersion,
        framework: pythonProjectInfo.framework,
        entryFiles: pythonProjectInfo.entryFiles,
        baseUrl: pythonProjectInfo.baseUrl,
        environment: pythonProjectInfo.environment,
      },
    };
    for (const message of pythonProjectInfo.warnings) {
      warnings.push({ message, severity: "warning" });
    }
  }

  if (language.id === "java") {
    const javaProjectInfo = await detectJavaProject(fs, options.projectPath);
    detectionCtx = {
      ...detectionCtx,
      javaProject: {
        dependencies: javaProjectInfo.dependencies,
        buildSystem: javaProjectInfo.buildSystem,
        springBootVersion: javaProjectInfo.springBootVersion,
        contextPath: javaProjectInfo.contextPath,
        servletPath: javaProjectInfo.servletPath,
        entryClasses: javaProjectInfo.entryClasses,
        sourceRoots: javaProjectInfo.sourceRoots,
      },
    };
    for (const message of javaProjectInfo.warnings) {
      warnings.push({ message, severity: "warning" });
    }
  }

  if (language.id === "rust") {
    const rustProjectInfo = await detectRustProject(fs, options.projectPath);
    detectionCtx = {
      ...detectionCtx,
      rustProject: {
        dependencies: rustProjectInfo.dependencies,
        workspaceMembers: rustProjectInfo.workspaceMembers,
        sourceRoots: rustProjectInfo.sourceRoots,
      },
    };
    for (const message of rustProjectInfo.warnings) {
      warnings.push({ message, severity: "warning" });
    }
  }

  if (language.id === "go") {
    const goProjectInfo = await detectGoProject(fs, options.projectPath);
    detectionCtx = {
      ...detectionCtx,
      goProject: {
        dependencies: goProjectInfo.dependencies,
        modulePath: goProjectInfo.modulePath,
      },
    };
    for (const message of goProjectInfo.warnings) {
      warnings.push({ message, severity: "warning" });
    }
  }

  options.onProgress?.({
    stage: "detecting-framework",
    message: `Detected ${language.name}. Finding frameworks...`,
    percent: 15,
  });

  let frameworks = await registry.detectFrameworks(language, detectionCtx);
  if (options.frameworks?.length) {
    frameworks = frameworks.filter((f) => options.frameworks!.includes(f.id));
  }

  if (frameworks.length === 0) {
    warnings.push({
      message: `No supported frameworks detected for ${language.name}.`,
      severity: "warning",
    });
    return {
      projectPath: options.projectPath,
      language: language.id,
      framework: "none",
      frameworks: [],
      endpoints: [],
      warnings,
      scannedFiles: 0,
      durationMs: Date.now() - start,
    };
  }

  const allEndpoints: ApiEndpoint[] = [];
  const frameworkIds: string[] = [];

  for (let i = 0; i < frameworks.length; i++) {
    const framework = frameworks[i];
    frameworkIds.push(framework.id);

    options.onProgress?.({
      stage: "extracting-routes",
      message: `Scanning ${framework.name} routes...`,
      percent: 20 + Math.round((i / frameworks.length) * 60),
    });

    try {
      const endpoints = await framework.scan({
        ...detectionCtx,
        options,
        packageJson,
        detectedFrameworks: frameworkIds,
        onProgress: options.onProgress,
      });
      allEndpoints.push(...endpoints);
    } catch (err) {
      warnings.push({
        message: `${framework.name} scanner failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: "warning",
      });
    }
  }

  const deduped = dedupeEndpoints(allEndpoints);

  if (deduped.length === 0) {
    warnings.push({
      message:
        "No routes found. Ensure route files use patterns like app.get('/path', handler) or router.post('/path', handler), and that the project folder was selected with read access.",
      severity: "warning",
    });
  }

  options.onProgress?.({
    stage: "complete",
    message: `Found ${deduped.length} endpoints`,
    percent: 100,
    routesFound: deduped.length,
  });

  return {
    projectPath: options.projectPath,
    language: language.id,
    framework: frameworkIds.join(", "),
    frameworks: frameworkIds,
    endpoints: deduped,
    warnings,
    scannedFiles: deduped.length,
    durationMs: Date.now() - start,
  };
}

function dedupeEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
  const seen = new Map<string, ApiEndpoint>();
  for (const ep of endpoints) {
    const key = `${ep.method}:${ep.path}`;
    if (!seen.has(key)) seen.set(key, ep);
  }
  return Array.from(seen.values());
}
