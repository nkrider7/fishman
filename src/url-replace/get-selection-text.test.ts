import { describe, expect, it } from "vitest";
import { selectionToFindPrefill } from "./get-selection-text";

describe("selectionToFindPrefill", () => {
  it("returns null for empty selection", () => {
    expect(selectionToFindPrefill("")).toBeNull();
    expect(selectionToFindPrefill("   ")).toBeNull();
  });

  it("keeps a bare origin", () => {
    expect(selectionToFindPrefill("http://localhost:4000")).toBe(
      "http://localhost:4000",
    );
  });

  it("collapses a full URL to origin", () => {
    expect(
      selectionToFindPrefill("http://localhost:4000/api/auth/login"),
    ).toBe("http://localhost:4000");
  });

  it("keeps non-URL fragments for literal replace", () => {
    expect(selectionToFindPrefill("/api/auth/login")).toBe("/api/auth/login");
    expect(selectionToFindPrefill("localhost:4000")).toBe("localhost:4000");
  });
});
