import { describe, expect, it } from "vitest";
import { parseDotEnv } from "./parse/dotenv";
import { classifyEnvPair, isSecretKeyName, toCamelCase } from "./classify";
import { suggestVariables } from "./suggest";
import { mergeDetectedIntoEnv, isStubLocalEnvironment } from "./merge";
import { scanProjectEnv } from "./scan";
import { applyEnvDetectToWorkspace, defaultAcceptedIds } from "./apply";
import { createMemoryFs, createFishmanWorkspace } from "@/git-native";
import type { DetectedVariable } from "./types";

describe("parseDotEnv", () => {
  it("parses basic KEY=VALUE and skips comments", () => {
    const env = parseDotEnv(`
# comment
PORT=4000
API_TOKEN=abc

EMPTY=
`);
    expect(env.PORT).toBe("4000");
    expect(env.API_TOKEN).toBe("abc");
    expect(env.EMPTY).toBe("");
  });

  it("handles export and quotes", () => {
    const env = parseDotEnv(`
export BASE_URL="https://api.example.com"
NAME='hello world'
ESCAPED="line\\nnext"
`);
    expect(env.BASE_URL).toBe("https://api.example.com");
    expect(env.NAME).toBe("hello world");
    expect(env.ESCAPED).toBe("line\nnext");
  });

  it("strips unquoted inline comments", () => {
    const env = parseDotEnv(`FOO=bar # trailing`);
    expect(env.FOO).toBe("bar");
  });
});

describe("classifyEnvPair", () => {
  it("maps PORT to baseUrl", () => {
    const c = classifyEnvPair("PORT", "4000");
    expect(c).toMatchObject({
      key: "baseUrl",
      value: "http://localhost:4000",
      secret: false,
      confidence: "high",
    });
  });

  it("maps API_URL to baseUrl", () => {
    const c = classifyEnvPair("VITE_API_URL", "https://api.example.com/");
    expect(c?.key).toBe("baseUrl");
    expect(c?.value).toBe("https://api.example.com");
  });

  it("marks tokens secret", () => {
    const c = classifyEnvPair("API_TOKEN", "shh-secret");
    expect(c).toMatchObject({ key: "token", secret: true, confidence: "high" });
  });

  it("marks DATABASE_URL with credentials as secret", () => {
    const c = classifyEnvPair(
      "DATABASE_URL",
      "postgres://user:pass@localhost:5432/db",
    );
    expect(c?.key).toBe("databaseUrl");
    expect(c?.secret).toBe(true);
  });

  it("detects secret key names", () => {
    expect(isSecretKeyName("JWT_SECRET")).toBe(true);
    expect(isSecretKeyName("STRIPE_PUBLISHABLE_KEY")).toBe(false);
  });

  it("camelCases keys", () => {
    expect(toCamelCase("DATABASE_URL")).toBe("databaseUrl");
  });
});

describe("suggestVariables", () => {
  it("prefers API_URL over PORT for baseUrl", () => {
    const vars = suggestVariables([
      {
        key: "PORT",
        value: "3000",
        source: { kind: "dotenv", path: ".env" },
      },
      {
        key: "API_URL",
        value: "https://api.example.com",
        source: { kind: "dotenv", path: ".env" },
      },
      {
        key: "API_TOKEN",
        value: "tok",
        source: { kind: "dotenv", path: ".env" },
      },
    ]);

    const base = vars.find((v) => v.key === "baseUrl" && v.enabled);
    expect(base?.value).toBe("https://api.example.com");
    expect(base?.secret).toBe(false);

    const token = vars.find((v) => v.key === "token" && v.enabled);
    expect(token?.value).toBe("tok");
    expect(token?.secret).toBe(true);
  });
});

describe("mergeDetectedIntoEnv", () => {
  const det = (partial: Partial<DetectedVariable> & { key: string; value: string }): DetectedVariable => ({
    id: partial.id ?? `id-${partial.key}`,
    key: partial.key,
    value: partial.value,
    secret: partial.secret ?? false,
    enabled: partial.enabled ?? true,
    confidence: partial.confidence ?? "high",
    source: partial.source ?? { kind: "dotenv", path: ".env" },
  });

  it("adds missing keys and skips conflicts by default", () => {
    const result = mergeDetectedIntoEnv(
      [{ key: "baseUrl", value: "http://custom:9000", enabled: true }],
      [
        det({ key: "baseUrl", value: "http://localhost:4000" }),
        det({ key: "token", value: "abc", secret: true }),
      ],
      "skip",
    );
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    const base = result.variables.find((v) => v.key === "baseUrl");
    expect(base?.value).toBe("http://custom:9000");
  });

  it("overwrites when policy is overwrite", () => {
    const result = mergeDetectedIntoEnv(
      [{ key: "baseUrl", value: "http://custom:9000", enabled: true }],
      [det({ key: "baseUrl", value: "http://localhost:4000" })],
      "overwrite",
    );
    expect(result.updated).toBe(1);
    expect(result.variables.find((v) => v.key === "baseUrl")?.value).toBe(
      "http://localhost:4000",
    );
  });

  it("is idempotent when values unchanged", () => {
    const vars = [det({ key: "baseUrl", value: "http://localhost:4000" })];
    const first = mergeDetectedIntoEnv([], vars, "skip");
    const second = mergeDetectedIntoEnv(first.variables, vars, "skip");
    expect(second.added).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("detects stub local env", () => {
    expect(
      isStubLocalEnvironment([
        { key: "baseUrl", value: "http://localhost:3000", enabled: true },
      ]),
    ).toBe(true);
    expect(
      isStubLocalEnvironment([
        { key: "baseUrl", value: "http://localhost:4000", enabled: true },
      ]),
    ).toBe(false);
  });
});

describe("scanProjectEnv + apply", () => {
  it("scans dotenv and writes public + secret env files", async () => {
    const fs = createMemoryFs({
      "proj/.env": `PORT=4000\nAPI_TOKEN=abc123\nDATABASE_URL=postgres://u:p@localhost/db\n`,
    });

    const report = await scanProjectEnv({
      projectPath: "proj",
      fs,
      now: () => "2026-01-01T00:00:00.000Z",
    });

    expect(report.sources.some((s) => s.path === ".env" && s.ok)).toBe(true);
    const base = report.variables.find((v) => v.key === "baseUrl" && v.enabled);
    expect(base?.value).toBe("http://localhost:4000");
    const token = report.variables.find((v) => v.key === "token" && v.enabled);
    expect(token?.secret).toBe(true);
    expect(token?.value).toBe("abc123");

    await createFishmanWorkspace(fs, {
      projectPath: "proj",
      name: "Test",
    });

    const accepted = defaultAcceptedIds(report.variables);
    // also accept databaseUrl if high confidence
    for (const v of report.variables) {
      if (v.key === "databaseUrl" && v.confidence === "high") {
        accepted.push(v.id);
      }
    }

    const result = await applyEnvDetectToWorkspace({
      fs,
      workspaceRootPath: "proj/fishman",
      report,
      envName: "local",
      acceptedIds: accepted,
      conflictPolicy: "overwrite",
    });

    expect(result.added + result.updated).toBeGreaterThan(0);

    const dump = fs.dump();
    const publicJson = JSON.parse(dump["proj/fishman/environments/local.json"]);
    const secretJson = JSON.parse(
      dump["proj/fishman/environments/local.secret.json"],
    );

    const publicToken = publicJson.variables.find(
      (v: { key: string }) => v.key === "token",
    );
    expect(publicToken?.secret).toBe(true);
    expect(publicToken?.value).toBe("");

    const secretToken = secretJson.variables.find(
      (v: { key: string }) => v.key === "token",
    );
    expect(secretToken?.value).toBe("abc123");

    const publicBase = publicJson.variables.find(
      (v: { key: string }) => v.key === "baseUrl",
    );
    expect(publicBase?.value).toBe("http://localhost:4000");
  });

  it("does not overwrite custom baseUrl when policy is skip", async () => {
    const fs = createMemoryFs({
      "proj/.env": `PORT=4000\n`,
    });
    await createFishmanWorkspace(fs, {
      projectPath: "proj",
      name: "Test",
    });
    // customize stub
    const dump0 = fs.dump();
    const env = JSON.parse(dump0["proj/fishman/environments/local.json"]);
    env.variables = [
      { key: "baseUrl", value: "http://custom:9000", enabled: true },
    ];
    await fs.writeFile(
      "proj/fishman/environments/local.json",
      JSON.stringify(env, null, 4),
    );

    const report = await scanProjectEnv({ projectPath: "proj", fs });
    const accepted = defaultAcceptedIds(report.variables);
    const result = await applyEnvDetectToWorkspace({
      fs,
      workspaceRootPath: "proj/fishman",
      report,
      envName: "local",
      acceptedIds: accepted,
      conflictPolicy: "skip",
    });

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    const publicJson = JSON.parse(
      fs.dump()["proj/fishman/environments/local.json"],
    );
    const base = publicJson.variables.find(
      (v: { key: string }) => v.key === "baseUrl",
    );
    expect(base?.value).toBe("http://custom:9000");
  });
});
