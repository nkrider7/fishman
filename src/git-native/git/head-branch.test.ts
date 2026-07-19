import { describe, expect, it } from "vitest";
import {
  isDetachedHeadContents,
  mergeLocalBranches,
  normalizeBranchName,
  parseSymbolicHeadBranch,
} from "@/git-native/git/head-branch";
import { formatGitError } from "@/git-native/git/auth";

describe("parseSymbolicHeadBranch", () => {
  it("reads unborn branch from HEAD", () => {
    expect(parseSymbolicHeadBranch("ref: refs/heads/soularsebrance\n")).toBe(
      "soularsebrance",
    );
  });

  it("reads main", () => {
    expect(parseSymbolicHeadBranch("ref: refs/heads/main")).toBe("main");
  });

  it("returns null for detached OID", () => {
    expect(
      parseSymbolicHeadBranch("abcdef0123456789abcdef0123456789abcdef01"),
    ).toBeNull();
  });

  it("returns null for empty", () => {
    expect(parseSymbolicHeadBranch("")).toBeNull();
  });
});

describe("isDetachedHeadContents", () => {
  it("detects OID", () => {
    expect(isDetachedHeadContents("abc1234")).toBe(true);
  });

  it("rejects symbolic ref", () => {
    expect(isDetachedHeadContents("ref: refs/heads/main")).toBe(false);
  });
});

describe("mergeLocalBranches", () => {
  it("prepends unborn symbolic head when list is empty", () => {
    expect(mergeLocalBranches([], "feature/x")).toEqual(["feature/x"]);
  });

  it("does not duplicate existing branch", () => {
    expect(mergeLocalBranches(["main", "dev"], "main")).toEqual([
      "main",
      "dev",
    ]);
  });

  it("keeps listed order when symbolic already present", () => {
    expect(mergeLocalBranches(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("keeps previous branches when adding current", () => {
    expect(mergeLocalBranches(["main", "dev"], "feature")).toEqual([
      "feature",
      "main",
      "dev",
    ]);
  });
});

describe("normalizeBranchName", () => {
  it("strips refs/heads prefix", () => {
    expect(normalizeBranchName(" refs/heads/foo ")).toBe("foo");
  });
});

describe("formatGitError", () => {
  it("maps unborn / no commits", () => {
    expect(
      formatGitError(new Error("your current branch does not have any commits yet")),
    ).toMatch(/no commits yet/i);
  });

  it("maps dirty checkout", () => {
    expect(
      formatGitError(
        new Error("Your local changes to the following files would be overwritten by checkout"),
      ),
    ).toMatch(/local changes/i);
  });
});
