import { describe, expect, it } from "vitest";
import { buildFileDiff } from "./file-diff";

describe("buildFileDiff", () => {
  it("shows all lines as ADDED for new file content", () => {
    const diff = buildFileDiff({
      path: "fishman/workspace.json",
      absolutePath: "/tmp/p/fishman/workspace.json",
      staged: false,
      status: "untracked",
      oldText: "",
      newText: '{\n  "name": "demo"\n}\n',
    });
    expect(diff.badge).toBe("UNTRACKED");
    expect(diff.hunks.length).toBe(1);
    expect(diff.hunks[0]!.header).toMatch(/@@ -0,0 \+/);
    expect(diff.hunks[0]!.lines.every((l) => l.kind === "add")).toBe(true);
  });

  it("marks deletions and additions for modified text", () => {
    const diff = buildFileDiff({
      path: "a.fish",
      absolutePath: "/tmp/a.fish",
      staged: true,
      status: "modified",
      oldText: "one\ntwo\nthree\n",
      newText: "one\ntwo-changed\nthree\n",
    });
    expect(diff.badge).toBe("MODIFIED");
    const kinds = diff.hunks.flatMap((h) => h.lines.map((l) => l.kind));
    expect(kinds).toContain("del");
    expect(kinds).toContain("add");
    expect(kinds).toContain("context");
  });

  it("marks full file as DELETED", () => {
    const diff = buildFileDiff({
      path: "gone.json",
      absolutePath: "/tmp/gone.json",
      staged: false,
      status: "deleted",
      oldText: "bye\n",
      newText: "",
    });
    expect(diff.badge).toBe("DELETED");
    expect(diff.hunks[0]!.lines.every((l) => l.kind === "del")).toBe(true);
  });
});
