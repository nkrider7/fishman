import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename, relative } from "node:path";
import type { FileSystemAdapter, FsDirEntry } from "../../core/types";
import { scanWithRoutePatterns } from "./route-scanner";

const SOUL_SERVER_PATH = join(
  import.meta.dirname,
  "../../../../../../soul-server",
);

function createNodeFileSystem(): FileSystemAdapter {
  return {
    async readFile(path: string) {
      return readFileSync(path, "utf-8");
    },
    async readDir(path: string): Promise<FsDirEntry[]> {
      return readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    },
    async exists(path: string) {
      return existsSync(path);
    },
    join(...parts: string[]) {
      return join(...parts);
    },
    basename(path: string) {
      return basename(path);
    },
    relative(from: string, to: string) {
      return relative(from, to);
    },
  };
}

describe("soul-server integration", () => {
  it.skipIf(!existsSync(SOUL_SERVER_PATH))(
    "resolves full /api/v1/* paths from real soul-server project",
    async () => {
      const fs = createNodeFileSystem();
      const endpoints = await scanWithRoutePatterns(
        {
          projectPath: SOUL_SERVER_PATH,
          fs,
          packageJson: {
            dependencies: { express: "^4.0.0" },
          },
          options: { projectPath: SOUL_SERVER_PATH },
          detectedFrameworks: ["express"],
        },
        "express",
        { receivers: ["router", "app"] },
      );

      const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);

      expect(paths).toContain("POST /api/v1/auth/login");
      expect(paths).toContain("POST /api/v1/auth/register");
      expect(paths).toContain("GET /api/v1/auth/me");
      expect(paths).toContain("GET /health");

      const login = endpoints.find((ep) => ep.path === "/api/v1/auth/login");
      expect(login).toBeDefined();
      expect(login?.requestBody?.schema).toMatchObject({
        email: expect.any(String),
        password: "",
      });

      const flatLogin = endpoints.find((ep) => ep.path === "/login");
      expect(flatLogin).toBeUndefined();
    },
    30_000,
  );
});
