import { describe, expect, it } from "vitest";
import type { RequestDraft } from "@/types/request";
import { createEmptyRequest } from "@/types/request";
import {
  buildVariableMap,
  substituteRequestDraft,
  substituteVariables,
} from "./variableSubstitution";

describe("substituteVariables", () => {
  const vars = { base_url: "https://api.example.com", token: "abc123" };

  it("replaces simple placeholders", () => {
    expect(substituteVariables("{{base_url}}/users", vars)).toBe(
      "https://api.example.com/users",
    );
  });

  it("replaces multiple placeholders", () => {
    expect(substituteVariables("{{base_url}}/{{token}}", vars)).toBe(
      "https://api.example.com/abc123",
    );
  });

  it("trims whitespace inside braces", () => {
    expect(substituteVariables("{{ base_url }}", vars)).toBe(
      "https://api.example.com",
    );
  });

  it("leaves unknown placeholders unchanged", () => {
    expect(substituteVariables("{{missing}}", vars)).toBe("{{missing}}");
  });

  it("returns text unchanged when no placeholders", () => {
    expect(substituteVariables("plain text", vars)).toBe("plain text");
  });
});

describe("buildVariableMap", () => {
  it("collection variables override global", () => {
    const map = buildVariableMap(
      [{ id: "1", key: "host", value: "global", enabled: true }],
      [{ id: "2", key: "host", value: "collection", enabled: true }],
    );
    expect(map.host).toBe("collection");
  });

  it("skips disabled variables", () => {
    const map = buildVariableMap(
      [{ id: "1", key: "host", value: "global", enabled: false }],
      [],
    );
    expect(map.host).toBeUndefined();
  });
});

describe("substituteRequestDraft", () => {
  it("substitutes url, headers, params, body, and auth", () => {
    const draft: RequestDraft = {
      ...createEmptyRequest("Test"),
      url: "{{base_url}}/users",
      params: [
        { id: "p1", key: "q", value: "{{token}}", enabled: true },
      ],
      headers: [
        { id: "h1", key: "Authorization", value: "Bearer {{token}}", enabled: true },
      ],
      body: '{"id":"{{token}}"}',
      bodyType: "json",
      auth: {
        type: "bearer",
        bearer: { token: "{{token}}" },
      },
    };

    const resolved = substituteRequestDraft(draft, {
      base_url: "https://api.test",
      token: "secret",
    });

    expect(resolved.url).toBe("https://api.test/users");
    expect(resolved.params[0].value).toBe("secret");
    expect(resolved.headers[0].value).toBe("Bearer secret");
    expect(resolved.body).toBe('{"id":"secret"}');
    expect(resolved.auth.bearer?.token).toBe("secret");
  });
});
