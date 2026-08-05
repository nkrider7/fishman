import type { ApiEndpoint } from "../models/endpoint";
import type { ScanOptions, ScanProgress } from "../models/scan-result";

export interface FsDirEntry {
  name: string;
  isDirectory: boolean;
}

export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<FsDirEntry[]>;
  exists(path: string): Promise<boolean>;
  join(...parts: string[]): string | Promise<string>;
  basename(path: string): string | Promise<string>;
  relative(from: string, to: string): string;
}

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PythonProjectManifest {
  dependencies: Record<string, string>;
  pythonVersion?: string;
  framework?: string | null;
  entryFiles?: string[];
  baseUrl?: string;
  environment?: Record<string, string>;
}

export interface JavaProjectManifest {
  dependencies: Record<string, string>;
  buildSystem?: "maven" | "gradle" | "unknown";
  springBootVersion?: string;
  contextPath?: string;
  servletPath?: string;
  entryClasses?: string[];
  sourceRoots?: string[];
}

export interface RustProjectManifest {
  dependencies: Record<string, string>;
  workspaceMembers?: string[];
  sourceRoots?: string[];
}

export interface GoProjectManifest {
  dependencies: Record<string, string>;
  modulePath?: string;
}

export interface DetectionContext {
  projectPath: string;
  fs: FileSystemAdapter;
  packageJson?: PackageJson;
  pythonProject?: PythonProjectManifest;
  javaProject?: JavaProjectManifest;
  rustProject?: RustProjectManifest;
  goProject?: GoProjectManifest;
}

export interface ScanContext extends DetectionContext {
  options: ScanOptions;
  onProgress?: (progress: ScanProgress) => void;
  packageJson: PackageJson;
  detectedFrameworks: string[];
}

export interface FrameworkPlugin {
  readonly id: string;
  readonly name: string;
  readonly languageId: string;
  detect(ctx: DetectionContext): Promise<boolean>;
  scan(ctx: ScanContext): Promise<ApiEndpoint[]>;
}

export interface LanguagePlugin {
  readonly id: string;
  readonly name: string;
  detect(ctx: DetectionContext): Promise<boolean>;
  getFrameworkPlugins(): FrameworkPlugin[];
}

export interface ScannerPluginRegistry {
  registerLanguage(plugin: LanguagePlugin): void;
  getLanguages(): LanguagePlugin[];
  detectLanguage(ctx: DetectionContext): Promise<LanguagePlugin | null>;
  detectFrameworks(
    language: LanguagePlugin,
    ctx: DetectionContext,
  ): Promise<FrameworkPlugin[]>;
}
