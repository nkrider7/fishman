import { describe, expect, it } from "vitest";
import {
  expandStatusLetter,
  mapStatusMatrixRow,
} from "@/git-native/git/status-map";

describe("status matrix mapping", () => {
  it("maps untracked", () => {
    expect(mapStatusMatrixRow(["a.fish", 0, 2, 0])).toEqual([
      { path: "a.fish", status: "untracked", staged: false },
    ]);
  });

  it("maps staged new file", () => {
    expect(mapStatusMatrixRow(["a.fish", 0, 2, 2])).toEqual([
      { path: "a.fish", status: "added", staged: true },
    ]);
  });

  it("maps unmodified as empty", () => {
    expect(mapStatusMatrixRow(["a.fish", 1, 1, 1])).toEqual([]);
  });

  it("expands staged+unstaged edits", () => {
    expect(mapStatusMatrixRow(["a.fish", 1, 2, 3])).toEqual([
      { path: "a.fish", status: "modified", staged: true },
      { path: "a.fish", status: "modified", staged: false },
    ]);
  });

  it("status letters", () => {
    expect(expandStatusLetter("untracked")).toBe("U");
    expect(expandStatusLetter("added")).toBe("A");
    expect(expandStatusLetter("modified")).toBe("M");
    expect(expandStatusLetter("deleted")).toBe("D");
  });
});
