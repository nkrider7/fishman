import { describe, expect, it } from "vitest";
import { createScannerMemoryFs, memoryFsFromEntries } from "../memory-fs";
import { planFilesToFetch, shouldIncludePath } from "./fetch-planner";
import { scanGitHubRepo } from "../scan-github-repo";
import type { GitHubHttpGet } from "./client";

describe("scanner memory fs", () => {
  it("reads files and lists directories under /repo", async () => {
    const fs = memoryFsFromEntries([
      { path: "pom.xml", content: "<project/>" },
      { path: "src/main/java/App.java", content: "class App {}" },
    ]);

    expect(await fs.exists("/repo")).toBe(true);
    expect(await fs.readFile("/repo/pom.xml")).toBe("<project/>");
    const root = await fs.readDir("/repo");
    expect(root.some((e) => e.name === "src" && e.isDirectory)).toBe(true);
    expect(root.some((e) => e.name === "pom.xml" && !e.isDirectory)).toBe(true);
  });

  it("join/relative stay under virtual root", async () => {
    const fs = createScannerMemoryFs({
      "/repo/src/A.java": "a",
    });
    const joined = await fs.join("/repo", "src", "A.java");
    expect(joined).toBe("/repo/src/A.java");
    expect(fs.relative("/repo", "/repo/src/A.java")).toBe("src/A.java");
  });
});

describe("fetch planner", () => {
  it("keeps java sources and manifests, excludes target/node_modules", () => {
    expect(shouldIncludePath("src/main/java/UserController.java")).toBe(true);
    expect(shouldIncludePath("build.gradle")).toBe(true);
    expect(shouldIncludePath("target/classes/App.class")).toBe(false);
    expect(shouldIncludePath("node_modules/lodash/index.js")).toBe(false);
    expect(shouldIncludePath("docs/logo.png")).toBe(false);

    const planned = planFilesToFetch([
      { path: "build.gradle", type: "blob", size: 100 },
      { path: "src/main/java/A.java", type: "blob", size: 200 },
      { path: "target/A.class", type: "blob", size: 200 },
      { path: "readme.md", type: "blob", size: 50 },
    ]);
    expect(planned.files.map((f) => f.path)).toEqual([
      "build.gradle",
      "src/main/java/A.java",
    ]);
  });
});

describe("scanGitHubRepo (mocked HTTP)", () => {
  it("downloads filtered files and scans Spring Boot controllers", async () => {
    const responses: Record<string, { status: number; body: string }> = {
      "https://api.github.com/repos/acme/demo": {
        status: 200,
        body: JSON.stringify({
          default_branch: "main",
          full_name: "acme/demo",
          private: false,
        }),
      },
      "https://api.github.com/repos/acme/demo/git/trees/main?recursive=1": {
        status: 200,
        body: JSON.stringify({
          truncated: false,
          tree: [
            { path: "build.gradle", type: "blob", size: 80 },
            {
              path: "src/main/java/com/acme/UserController.java",
              type: "blob",
              size: 200,
            },
            { path: "target/skip.class", type: "blob", size: 10 },
          ],
        }),
      },
      "https://raw.githubusercontent.com/acme/demo/main/build.gradle": {
        status: 200,
        body: `
plugins { id 'org.springframework.boot' version '3.2.0' }
dependencies { implementation 'org.springframework.boot:spring-boot-starter-web' }
`,
      },
      "https://raw.githubusercontent.com/acme/demo/main/src/main/java/com/acme/UserController.java":
        {
          status: 200,
          body: `
package com.acme;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users")
public class UserController {
  @GetMapping("/{id}")
  public String get(@PathVariable String id) { return id; }

  @PostMapping
  public String create(@RequestBody String body) { return body; }
}
`,
        },
    };

    const httpGet: GitHubHttpGet = async (url) => {
      const hit = responses[url];
      if (!hit) return { status: 404, body: "missing", headers: {} };
      return { status: hit.status, body: hit.body, headers: {} };
    };

    const result = await scanGitHubRepo({
      url: "https://github.com/acme/demo",
      clientOptions: { httpGet },
      baseUrl: "http://localhost:8080",
    });

    expect(result.language).toBe("java");
    expect(result.frameworks).toContain("spring-boot");
    expect(result.endpoints.some((ep) => ep.path.includes("/users"))).toBe(true);
    expect(result.projectPath).toContain("github://acme/demo@main");
  });
});
