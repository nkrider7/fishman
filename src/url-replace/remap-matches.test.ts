import { describe, expect, it } from "vitest";
import { remapMatchReplace } from "./remap-matches";
import type { UrlReplaceMatch } from "./types";

function match(partial: Partial<UrlReplaceMatch> & Pick<UrlReplaceMatch, "id" | "before">): UrlReplaceMatch {
  return {
    kind: "request",
    targetId: partial.id,
    name: "x",
    breadcrumb: "",
    after: partial.before,
    matchStart: 0,
    matchLength: partial.before.length,
    selected: true,
    ...partial,
  };
}

describe("remapMatchReplace", () => {
  it("updates after without changing before/selection", () => {
    const base = [
      match({
        id: "1",
        before: "http://localhost:3000/api",
        matchStart: 0,
        matchLength: "http://localhost:3000".length,
      }),
    ];
    const next = remapMatchReplace(
      base,
      "http://localhost:3000",
      "http://localhost:4000",
      { matchCase: false, wholeOrigin: true },
    );
    expect(next[0]?.before).toBe("http://localhost:3000/api");
    expect(next[0]?.after).toBe("http://localhost:4000/api");
    expect(next[0]?.selected).toBe(true);
  });

  it("returns identity after when replace empty", () => {
    const base = [
      match({
        id: "1",
        before: "http://localhost:3000/api",
        after: "http://localhost:4000/api",
      }),
    ];
    const next = remapMatchReplace(base, "http://localhost:3000", "", {
      matchCase: false,
      wholeOrigin: true,
    });
    expect(next[0]?.after).toBe("http://localhost:3000/api");
  });
});
