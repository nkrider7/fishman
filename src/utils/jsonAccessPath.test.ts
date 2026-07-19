import { describe, expect, it } from "vitest";
import { formatJsonAccessPath } from "./jsonAccessPath";

describe("formatJsonAccessPath", () => {
  it("prefixes nested object keys with data", () => {
    expect(formatJsonAccessPath(["data", "accessToken"])).toBe(
      "data.data.accessToken",
    );
  });

  it("handles root-level keys", () => {
    expect(formatJsonAccessPath(["statusCode"])).toBe("data.statusCode");
  });

  it("uses bracket notation for array indices", () => {
    expect(formatJsonAccessPath(["items", 0, "id"])).toBe("data.items[0].id");
  });

  it("quotes keys that are not valid identifiers", () => {
    expect(formatJsonAccessPath(["foo-bar", "x"])).toBe(
      'data["foo-bar"].x',
    );
  });

  it("supports a custom root name", () => {
    expect(formatJsonAccessPath(["token"], "body")).toBe("body.token");
  });
});
