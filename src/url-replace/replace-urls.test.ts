import { describe, expect, it } from "vitest";
import {
  applyFieldReplace,
  applyUrlReplace,
  extractOrigin,
  isSafeLiteralMatch,
  parseOriginInput,
  preserveTrailingSlash,
  replaceLiteralInUrl,
  replaceOriginInUrl,
  summarizeMatches,
} from "./replace-urls";

describe("extractOrigin", () => {
  it("extracts http origin with port", () => {
    expect(extractOrigin("http://localhost:3000/api/users")).toBe(
      "http://localhost:3000",
    );
  });

  it("extracts https without port", () => {
    expect(extractOrigin("https://api.example.com/v1")).toBe(
      "https://api.example.com",
    );
  });

  it("extracts ws origins", () => {
    expect(extractOrigin("ws://localhost:3000/socket")).toBe(
      "ws://localhost:3000",
    );
  });

  it("skips template URLs", () => {
    expect(extractOrigin("{{base_url}}/users")).toBeNull();
  });

  it("skips relative paths", () => {
    expect(extractOrigin("/api/users")).toBeNull();
  });
});

describe("parseOriginInput", () => {
  it("accepts bare origin", () => {
    expect(parseOriginInput("http://localhost:3000", true)).toBe(
      "http://localhost:3000",
    );
  });

  it("strips trailing slash", () => {
    expect(parseOriginInput("http://localhost:3000/", true)).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects origin with path", () => {
    expect(parseOriginInput("http://localhost:3000/api", true)).toBeNull();
  });
});

describe("replaceOriginInUrl", () => {
  it("replaces origin and preserves path/query/hash", () => {
    const result = replaceOriginInUrl(
      "http://localhost:3000/api/users?x=1#top",
      "http://localhost:3000",
      "http://localhost:4000",
      true,
    );
    expect(result?.next).toBe("http://localhost:4000/api/users?x=1#top");
  });

  it("does not match longer ports", () => {
    const result = replaceOriginInUrl(
      "http://localhost:30000/api",
      "http://localhost:3000",
      "http://localhost:4000",
      true,
    );
    expect(result).toBeNull();
  });

  it("is case-insensitive when matchCase is false", () => {
    const result = replaceOriginInUrl(
      "HTTP://LOCALHOST:3000/x",
      "http://localhost:3000",
      "http://localhost:4000",
      false,
    );
    expect(result?.next.toLowerCase()).toBe("http://localhost:4000/x");
  });

  it("skips template URLs", () => {
    expect(
      replaceOriginInUrl(
        "{{base_url}}/users",
        "http://localhost:3000",
        "http://localhost:4000",
        true,
      ),
    ).toBeNull();
  });
});

describe("literal replace safeguards", () => {
  it("blocks :3000 matching inside :30000", () => {
    expect(isSafeLiteralMatch("http://localhost:30000/a", 0, "http://localhost:3000".length)).toBe(
      false,
    );
    const idx = "http://localhost:30000/a".indexOf("http://localhost:3000");
    expect(isSafeLiteralMatch("http://localhost:30000/a", idx, "http://localhost:3000".length)).toBe(
      false,
    );
  });

  it("allows match before path slash", () => {
    const url = "http://localhost:3000/api";
    const find = "http://localhost:3000";
    expect(isSafeLiteralMatch(url, 0, find.length)).toBe(true);
  });

  it("replaceLiteralInUrl does not touch :30000", () => {
    expect(
      replaceLiteralInUrl(
        "http://localhost:30000/api",
        "http://localhost:3000",
        "http://localhost:4000",
        true,
      ),
    ).toBeNull();
  });
});

describe("applyUrlReplace", () => {
  it("origin mode default happy path", () => {
    const result = applyUrlReplace(
      "http://localhost:3000/api/route",
      "http://localhost:3000",
      "http://localhost:4000",
      { matchCase: false, wholeOrigin: true },
    );
    expect(result?.next).toBe("http://localhost:4000/api/route");
  });

  it("returns null when find equals replace", () => {
    expect(
      applyUrlReplace("http://localhost:3000/a", "http://localhost:3000", "http://localhost:3000", {
        matchCase: false,
        wholeOrigin: true,
      }),
    ).toBeNull();
  });

  it("trims find/replace inputs", () => {
    const result = applyUrlReplace(
      "http://localhost:3000/a",
      "  http://localhost:3000  ",
      "  http://localhost:4000  ",
      { matchCase: false, wholeOrigin: true },
    );
    expect(result?.next).toBe("http://localhost:4000/a");
  });
});

describe("path prefix replace (v1/v2 before /api)", () => {
  it("preserves trailing slash so /api/cycle stays /api/cycle", () => {
    expect(
      preserveTrailingSlash(
        "http://localhost:4000/api/",
        "http://localhost:9000/v1/api",
      ),
    ).toBe("http://localhost:9000/v1/api/");

    const result = applyFieldReplace(
      "http://localhost:4000/api/cycle/",
      "http://localhost:4000/api/",
      "http://localhost:9000/v1/api",
      "url",
      { matchCase: false, wholeOrigin: false },
    );
    expect(result?.next).toBe("http://localhost:9000/v1/api/cycle/");
    expect(result?.matchLength).toBe("http://localhost:4000/api/".length);
  });

  it("inserts /v1 before /api even when wholeOrigin is on", () => {
    const result = applyFieldReplace(
      "http://localhost:4000/api/users",
      "http://localhost:4000/api",
      "http://localhost:4000/v1/api",
      "url",
      { matchCase: false, wholeOrigin: true },
    );
    expect(result?.next).toBe("http://localhost:4000/v1/api/users");
  });
});

describe("summarizeMatches", () => {
  it("counts fields and selection", () => {
    expect(
      summarizeMatches([
        { kind: "request-url", field: "url", selected: true },
        { kind: "request-body", field: "body", selected: false },
        { kind: "request-param", field: "param", selected: true },
        { kind: "folder-base", field: "folder-base", selected: true },
        { kind: "env-var", field: "env-var", selected: true },
        { kind: "open-tab", field: "open-tab", selected: true },
      ]),
    ).toEqual({
      total: 6,
      selected: 5,
      urls: 1,
      bodies: 1,
      params: 1,
      folders: 1,
      envVars: 1,
      openTabs: 1,
    });
  });
});
