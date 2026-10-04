import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectOpenApiContent } from "./detect";
import { mapSpecToImportResult, parseSpecDocument } from "./map-to-import";
import { parseSpecContent } from "./parse";
import { prepareConnectFromContent } from "./connect";

const dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(dir, "fixtures", name), "utf8");
}

describe("openapi parse + map", () => {
  it("parses OpenAPI 3 JSON with tags, params, and body", () => {
    const content = loadFixture("openapi-3-pets.json");
    expect(detectOpenApiContent(content, "openapi.json")).toBe(true);

    const parsed = parseSpecDocument(content, "openapi.json");
    expect(parsed.document.format).toBe("openapi");
    expect(parsed.document.title).toBe("Pet Store");
    expect(parsed.document.baseUrl).toBe("https://api.example.com/v1");
    expect(parsed.endpoints.length).toBe(3);

    const list = parsed.endpoints.find((e) => e.name === "List pets");
    expect(list?.method).toBe("GET");
    expect(list?.queryParameters.some((p) => p.name === "limit")).toBe(true);
    expect(list?.folder).toEqual(["pets"]);

    const create = parsed.endpoints.find((e) => e.name === "Create pet");
    expect(create?.requestBody?.example).toContain("Fluffy");

    const result = mapSpecToImportResult(content, "openapi.json");
    expect(result.requests.length).toBe(3);
    expect(
      result.requests.every((r) => r.draft.scan?.origin === "openapi"),
    ).toBe(true);
    expect(result.variables?.some((v) => v.key === "baseUrl")).toBe(true);
  });

  it("parses Swagger 2 YAML", () => {
    const content = loadFixture("swagger-2-store.yaml");
    expect(detectOpenApiContent(content, "swagger.yaml")).toBe(true);

    const parsed = parseSpecDocument(content, "swagger.yaml");
    expect(parsed.document.format).toBe("swagger");
    expect(parsed.document.baseUrl).toBe("https://legacy.example.com/api");
    expect(parsed.endpoints.length).toBe(3);

    const getItem = parsed.endpoints.find(
      (e) => e.path === "/items/{id}" && e.method === "GET",
    );
    expect(getItem?.pathParameters.some((p) => p.name === "id")).toBe(true);
  });

  it("rejects empty / invalid specs", () => {
    expect(() => parseSpecContent("")).toThrow(/empty/i);
    expect(() => parseSpecContent("<!DOCTYPE html><html></html>")).toThrow(
      /HTML/i,
    );
    expect(detectOpenApiContent('{"info":{}}')).toBe(false);
  });

  it("prepareConnectFromContent builds link draft + import", () => {
    const content = loadFixture("openapi-3-pets.json");
    const prepared = prepareConnectFromContent({
      content,
      filename: "pets.json",
      source: "file",
      filePath: "/tmp/pets.json",
    });
    expect(prepared.endpointCount).toBe(3);
    expect(prepared.linkDraft.source).toBe("file");
    expect(prepared.linkDraft.lastSpecFingerprint.length).toBeGreaterThan(0);
    expect(prepared.importResult.rootFolder.name).toBe("Pet Store");
  });
});
