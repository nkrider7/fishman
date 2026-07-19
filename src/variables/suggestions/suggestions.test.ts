import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  buildSuggestionCatalog,
  detectOpenVariable,
  filterSuggestions,
} from "./index";
import type { VariableInfo } from "@/utils/variableSubstitution";

describe("detectOpenVariable", () => {
  it("detects {{ after typing braces", () => {
    const text = "https://{{";
    const match = detectOpenVariable(text, text.length);
    expect(match).toMatchObject({
      openStart: 8,
      query: "",
      replaceEnd: 10,
    });
  });

  it("captures a partial query", () => {
    const text = "{{acc";
    const match = detectOpenVariable(text, text.length);
    expect(match?.query).toBe("acc");
  });

  it("returns null when token is already closed", () => {
    const text = "{{token}}/path";
    expect(detectOpenVariable(text, text.length)).toBeNull();
    expect(detectOpenVariable(text, 9)).toBeNull(); // inside }}
  });

  it("absorbs trailing }} into replaceEnd", () => {
    const text = "{{tok}}";
    // caret between k and }
    const match = detectOpenVariable(text, 5);
    expect(match?.query).toBe("tok");
    expect(match?.replaceEnd).toBe(7);
  });
});

describe("filterSuggestions", () => {
  const catalog = buildSuggestionCatalog({
    variableInfo: {
      accessToken: { value: "secret", scope: "collection" },
      authTokens: { value: "[]", scope: "global" },
      baseUrl: { value: "http://localhost", scope: "collection" },
    } satisfies Record<string, VariableInfo>,
  });

  it("filters by prefix", () => {
    const hits = filterSuggestions(catalog, "a");
    expect(hits.map((h) => h.name)).toEqual(
      expect.arrayContaining(["accessToken", "authTokens"]),
    );
    expect(hits[0].name.startsWith("a") || hits[0].name.startsWith("$")).toBe(
      true,
    );
  });

  it("ranks exact / prefix env vars above weaker matches", () => {
    const hits = filterSuggestions(catalog, "access");
    expect(hits[0].name).toBe("accessToken");
  });

  it("matches dynamic vars without requiring $", () => {
    const hits = filterSuggestions(catalog, "iso");
    expect(hits.some((h) => h.name === "$isoTimestamp")).toBe(true);
  });
});

describe("applySuggestion", () => {
  it("inserts a complete {{name}} token", () => {
    const text = "Bearer {{acc";
    const match = detectOpenVariable(text, text.length)!;
    const result = applySuggestion(text, match, {
      id: "env:accessToken",
      name: "accessToken",
      kind: "environment",
      sourceLabel: "collection",
    });
    expect(result.value).toBe("Bearer {{accessToken}}");
    expect(result.caret).toBe(result.value.length);
  });
});
