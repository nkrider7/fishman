import { describe, expect, it } from "vitest";
import { generateCode, toEffectiveRequest } from "@/codegen";
import { createEmptyRequest } from "@/types/request";
import type { RequestDraft } from "@/types/request";
import { generateCurl } from "@/codegen/targets/shell";
import { generateJsAxios, generateJsFetch } from "@/codegen/targets/javascript";

function baseDraft(overrides: Partial<RequestDraft> = {}): RequestDraft {
  return {
    ...createEmptyRequest("Test"),
    method: "GET",
    url: "https://api.example.com/users",
    ...overrides,
  };
}

describe("toEffectiveRequest", () => {
  it("applies query params and bearer auth", () => {
    const draft = baseDraft({
      params: [
        { id: "1", key: "page", value: "1", enabled: true },
        { id: "2", key: "skip", value: "x", enabled: false },
      ],
      headers: [
        { id: "h1", key: "Accept", value: "application/json", enabled: true },
      ],
      auth: { type: "bearer", bearer: { token: "secret-token" } },
    });

    const effective = toEffectiveRequest(draft, {}, false);

    expect(effective.url).toBe("https://api.example.com/users?page=1");
    expect(effective.headers).toEqual(
      expect.arrayContaining([
        { key: "Accept", value: "application/json" },
        { key: "Authorization", value: "Bearer secret-token" },
      ]),
    );
    expect(effective.headers.find((h) => h.key === "skip")).toBeUndefined();
  });

  it("includes json body for POST", () => {
    const draft = baseDraft({
      method: "POST",
      bodyType: "json",
      body: '{"name":"Ada"}',
      auth: { type: "basic", basic: { username: "u", password: "p" } },
    });

    const effective = toEffectiveRequest(draft, {}, false);
    expect(effective.body).toBe('{"name":"Ada"}');
    expect(effective.bodyType).toBe("json");
    const auth = effective.headers.find((h) => h.key === "Authorization");
    expect(auth?.value).toMatch(/^Basic /);
  });

  it("applies apikey to query when configured", () => {
    const draft = baseDraft({
      auth: {
        type: "apikey",
        apikey: { key: "api_key", value: "abc", addTo: "query" },
      },
    });
    const effective = toEffectiveRequest(draft, {}, false);
    expect(effective.url).toContain("api_key=abc");
  });
});

describe("interpolateVariables", () => {
  it("keeps placeholders when interpolate is off", () => {
    const draft = baseDraft({
      url: "{{base_url}}/users/{{id}}",
      headers: [
        {
          id: "1",
          key: "X-Token",
          value: "Bearer {{token}}",
          enabled: true,
        },
      ],
    });
    const vars = { base_url: "https://prod.example.com", id: "42", token: "t" };
    const effective = toEffectiveRequest(draft, vars, false);
    expect(effective.url).toBe("{{base_url}}/users/{{id}}");
    expect(effective.headers[0]?.value).toBe("Bearer {{token}}");
  });

  it("replaces placeholders when interpolate is on", () => {
    const draft = baseDraft({
      url: "{{base_url}}/users/{{id}}",
      headers: [
        {
          id: "1",
          key: "X-Token",
          value: "{{token}}",
          enabled: true,
        },
      ],
      bodyType: "json",
      body: '{"token":"{{token}}"}',
    });
    const vars = {
      base_url: "https://prod.example.com",
      id: "42",
      token: "t-secret",
    };
    const effective = toEffectiveRequest(draft, vars, true);
    expect(effective.url).toBe("https://prod.example.com/users/42");
    expect(effective.headers[0]?.value).toBe("t-secret");
    expect(effective.body).toBe('{"token":"t-secret"}');
  });
});

describe("curl generator", () => {
  it("escapes quotes and uses backslash continuations", () => {
    const effective = toEffectiveRequest(
      baseDraft({
        method: "POST",
        url: "https://api.example.com/echo",
        bodyType: "json",
        body: `{"msg":"it's fine"}`,
        headers: [
          { id: "1", key: "Content-Type", value: "application/json", enabled: true },
        ],
        auth: { type: "bearer", bearer: { token: "tok" } },
      }),
      {},
      false,
    );

    const snippet = generateCurl(effective);
    expect(snippet).toContain("curl");
    expect(snippet).toContain("--request POST");
    expect(snippet).toContain("\\");
    expect(snippet).toContain("it'\\''s fine");
    expect(snippet).toMatch(/'Authorization: Bearer tok'/);
  });
});

describe("fetch / axios generators", () => {
  it("produces runnable-looking fetch for GET", () => {
    const effective = toEffectiveRequest(
      baseDraft({
        params: [{ id: "1", key: "q", value: "test", enabled: true }],
      }),
      {},
      false,
    );
    const snippet = generateJsFetch(effective);
    expect(snippet).toContain("await fetch(");
    expect(snippet).toContain("method: \"GET\"");
    expect(snippet).toContain("q=test");
  });

  it("produces axios POST with JSON body", () => {
    const effective = toEffectiveRequest(
      baseDraft({
        method: "POST",
        bodyType: "json",
        body: '{"ok":true}',
        auth: { type: "bearer", bearer: { token: "abc" } },
      }),
      {},
      false,
    );
    const snippet = generateJsAxios(effective);
    expect(snippet).toContain("import axios");
    expect(snippet).toContain('method: "post"');
    expect(snippet).toContain("Bearer abc");
    expect(snippet).toContain('"ok":true');
  });
});

describe("generateCode facade", () => {
  it("switches language/client and respects interpolate", () => {
    const draft = baseDraft({
      url: "{{base_url}}/ping",
    });
    const vars = { base_url: "https://x.test" };

    const curl = generateCode(draft, vars, {
      languageId: "shell",
      clientId: "curl",
      interpolateVariables: true,
    });
    expect(curl).toContain("https://x.test/ping");

    const raw = generateCode(draft, vars, {
      languageId: "shell",
      clientId: "httpie",
      interpolateVariables: false,
    });
    expect(raw).toContain("{{base_url}}/ping");

    const py = generateCode(draft, vars, {
      languageId: "python",
      clientId: "requests",
      interpolateVariables: true,
    });
    expect(py).toContain("import requests");
    expect(py).toContain("https://x.test/ping");
  });
});
