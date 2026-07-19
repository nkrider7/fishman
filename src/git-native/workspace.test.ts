import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalize,
  createFishmanWorkspace,
  createMemoryFs,
  createUid,
  detectGit,
  fishRequestToDraft,
  folderChainToRequest,
  GitNativeError,
  mergeInheritedSettings,
  mergeSecretOverlay,
  parseWorkspaceDir,
  requestDraftToFish,
  resolveUnderRoot,
  serializeJson,
  serializeRequestJson,
  serializeWorkspaceDir,
  slugify,
  stripSecretVariables,
} from "@/git-native";
import { createEmptyRequest } from "@/types/request";

const FIXTURE_PROJECT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures",
  "sample-project",
);

function loadFixtureProject() {
  const files: Record<string, string> = {};

  function walk(dir: string, prefix: string) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(abs).isDirectory()) {
        walk(abs, rel);
      } else {
        files[rel] = readFileSync(abs, "utf8");
      }
    }
  }

  walk(FIXTURE_PROJECT, "");
  return createMemoryFs(files);
}

describe("deterministic JSON", () => {
  it("sorts object keys and header arrays", () => {
    const json = serializeJson({
      z: 1,
      a: 2,
      headers: [
        { key: "Zebra", value: "1", enabled: true },
        { key: "Accept", value: "json", enabled: true },
      ],
    });
    expect(json).toBe(
      `{
    "a": 2,
    "headers": [
        {
            "enabled": true,
            "key": "Accept",
            "value": "json"
        },
        {
            "enabled": true,
            "key": "Zebra",
            "value": "1"
        }
    ],
    "z": 1
}
`,
    );
    expect(json.endsWith("\n")).toBe(true);
    expect(json.includes("\r")).toBe(false);
  });

  it("canonicalize is stable across input key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toEqual(canonicalize({ a: 2, b: 1 }));
  });
});

describe("path sandbox", () => {
  const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/");

  it("resolves under root", () => {
    expect(
      resolveUnderRoot("/proj/fishman", "collections/Auth/Login.fish", joinPath),
    ).toBe("/proj/fishman/collections/Auth/Login.fish");
  });

  it("rejects escapes", () => {
    expect(() =>
      resolveUnderRoot("/proj/fishman", "../secret", joinPath),
    ).toThrow(GitNativeError);
  });
});

describe("secrets", () => {
  it("strips and merges secret overlays", () => {
    const { publicVars, secretVars } = stripSecretVariables([
      { key: "token", value: "shh", enabled: true, secret: true },
    ]);
    expect(publicVars[0].value).toBe("");
    expect(secretVars[0].value).toBe("shh");

    const merged = mergeSecretOverlay(publicVars, [
      { key: "token", value: "from-file", enabled: true, secret: true },
    ]);
    expect(merged[0].value).toBe("from-file");
  });
});

describe("parseWorkspaceDir (fixture)", () => {
  it("loads fishman/ workspace with .fish requests", async () => {
    const fs = loadFixtureProject();
    const graph = await parseWorkspaceDir(fs, "fishman");

    expect(graph.workspace.name).toBe("Backend");
    expect(graph.workspace.version).toBe(1);

    const auth = graph.collectionsRoot.folders.find((f) => f.name === "Auth");
    expect(auth?.requests.map((r) => r.name)).toContain("Login");
    expect(auth?.requests[0]?.relativePath).toBe(
      "collections/Auth/Login.fish",
    );

    const users = graph.collectionsRoot.folders.find((f) => f.name === "Users");
    expect(users?.requests[0]?.request.method).toBe("GET");
    expect(users?.requests[0]?.name).toBe("Get Users");

    const token = graph.environments[0].environment.variables.find(
      (v) => v.key === "token",
    );
    expect(token?.value).toBe("secret-token-value");
  });

  it("merges folder auth inheritance for Login sibling with inherit", async () => {
    const fs = loadFixtureProject();
    const graph = await parseWorkspaceDir(fs, "fishman");
    const auth = graph.collectionsRoot.folders.find((f) => f.name === "Auth")!;
    const login = auth.requests[0]!;

    // Simulate inherit on login for merge test
    login.request = { ...login.request, auth: { type: "inherit" } };
    const chain = folderChainToRequest(graph.collectionsRoot, login.relativePath);
    const effective = mergeInheritedSettings(chain, login);
    expect(effective.auth.type).toBe("bearer");
  });

  it("throws without workspace.json", async () => {
    const fs = createMemoryFs({ "empty/readme.txt": "x" });
    await expect(parseWorkspaceDir(fs, "empty")).rejects.toMatchObject({
      code: "NOT_A_COLLECTION",
    });
  });
});

describe("round-trip", () => {
  it("serialize → parse preserves ids and secrets", async () => {
    const src = loadFixtureProject();
    const original = await parseWorkspaceDir(src, "fishman");

    const dest = createMemoryFs();
    await serializeWorkspaceDir(dest, {
      ...original,
      source: { ...original.source, rootPath: "out/fishman" },
    });

    const dump = dest.dump();
    expect(dump["out/fishman/workspace.json"]).toContain("Backend");
    expect(dump["out/fishman/collections/Auth/Login.fish"]).toContain(
      "req_login01",
    );
    expect(
      dump["out/fishman/environments/local.secret.json"],
    ).toContain("secret-token-value");
    expect(dump["out/fishman/.gitignore"]).toContain("*.secret.json");

    // Deterministic key order in written request
    const loginJson = dump["out/fishman/collections/Auth/Login.fish"];
    expect(loginJson.indexOf('"auth"')).toBeLessThan(
      loginJson.indexOf('"body"'),
    );

    const reparsed = await parseWorkspaceDir(dest, "out/fishman");
    expect(reparsed.collectionsRoot.folders.map((f) => f.name).sort()).toEqual(
      ["Auth", "Users"],
    );
  });
});

describe("createFishmanWorkspace", () => {
  it("scaffolds fishman/ under a project", async () => {
    const fs = createMemoryFs();
    const graph = await createFishmanWorkspace(fs, {
      projectPath: "my-api",
      name: "Mobile",
    });
    expect(graph.source.rootPath).toBe("my-api/fishman");
    expect(graph.workspace.name).toBe("Mobile");
    expect(await fs.exists("my-api/fishman/collections")).toBe(true);
    expect(await fs.exists("my-api/fishman/environments/local.json")).toBe(
      true,
    );
  });
});

describe("git detect", () => {
  it("detects .git directory", async () => {
    const fs = createMemoryFs({
      "proj/.git/HEAD": "ref: refs/heads/main",
      "proj/fishman/workspace.json": JSON.stringify({
        version: 1,
        id: "ws1",
        name: "W",
      }),
    });
    const result = await detectGit(fs, "proj");
    expect(result.hasGit).toBe(true);
  });

  it("reports missing git", async () => {
    const fs = createMemoryFs({ "proj/readme.md": "x" });
    const result = await detectGit(fs, "proj");
    expect(result.hasGit).toBe(false);
  });
});

describe("draft mapping", () => {
  it("round-trips RequestDraft ↔ .fish", () => {
    const draft = createEmptyRequest();
    draft.id = createUid("req");
    draft.name = "Create User";
    draft.method = "POST";
    draft.url = "{{baseUrl}}/users";
    draft.bodyType = "json";
    draft.body = '{"name":"Ada"}';

    const fish = requestDraftToFish(draft);
    expect(serializeRequestJson(fish)).toContain("Create User");
    const back = fishRequestToDraft(fish);
    expect(back.method).toBe("POST");
    expect(back.bodyType).toBe("json");
  });
});

describe("slugify still works for indexes", () => {
  it("slugifies", () => {
    expect(slugify("Get Users")).toBe("get-users");
  });
});
