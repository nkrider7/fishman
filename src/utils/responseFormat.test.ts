import { describe, expect, it } from "vitest";
import {
  detectResponseFormat,
  prepareHtmlForPreview,
  resolveResponseFormat,
} from "./responseFormat";

describe("detectResponseFormat", () => {
  it("detects JSON from content-type", () => {
    expect(
      detectResponseFormat({ "content-type": "application/json" }, "{}"),
    ).toBe("json");
  });

  it("detects HTML from content-type", () => {
    expect(
      detectResponseFormat({ "content-type": "text/html; charset=utf-8" }, ""),
    ).toBe("html");
  });

  it("sniffs HTML from body when content-type is missing", () => {
    expect(
      detectResponseFormat({}, "<!DOCTYPE html><html><body>Hi</body></html>"),
    ).toBe("html");
  });

  it("sniffs JSON from body", () => {
    expect(detectResponseFormat({}, '{"ok":true}')).toBe("json");
  });
});

describe("resolveResponseFormat", () => {
  it("honors manual format override", () => {
    expect(resolveResponseFormat("xml", {}, '{"a":1}')).toBe("xml");
  });
});

describe("prepareHtmlForPreview", () => {
  it("wraps HTML fragments", () => {
    const result = prepareHtmlForPreview("<p>Hello</p>");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<p>Hello</p>");
  });

  it("passes through full documents", () => {
    const doc = "<!DOCTYPE html><html><body>Page</body></html>";
    expect(prepareHtmlForPreview(doc)).toBe(doc);
  });
});
