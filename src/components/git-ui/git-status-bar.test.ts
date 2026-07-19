import { describe, expect, it } from "vitest";
import {
  formatRemoteUrlForStatusBar,
  pickPrimaryRemote,
} from "@/components/git-ui/GitBranchSwitcher";

describe("pickPrimaryRemote", () => {
  it("returns null for empty list", () => {
    expect(pickPrimaryRemote(undefined)).toBeNull();
    expect(pickPrimaryRemote([])).toBeNull();
  });

  it("prefers origin when present", () => {
    expect(
      pickPrimaryRemote([
        { name: "upstream", url: "https://example.com/up.git" },
        { name: "origin", url: "https://github.com/acme/app.git" },
      ]),
    ).toEqual({ name: "origin", url: "https://github.com/acme/app.git" });
  });

  it("falls back to the first remote", () => {
    expect(
      pickPrimaryRemote([{ name: "fork", url: "git@host:org/repo.git" }]),
    ).toEqual({ name: "fork", url: "git@host:org/repo.git" });
  });
});

describe("formatRemoteUrlForStatusBar", () => {
  it("formats https remotes", () => {
    expect(
      formatRemoteUrlForStatusBar("https://github.com/acme/soul-server.git"),
    ).toBe("github.com/acme/soul-server");
  });

  it("formats ssh remotes", () => {
    expect(
      formatRemoteUrlForStatusBar("git@github.com:acme/soul-server.git"),
    ).toBe("github.com/acme/soul-server");
  });

  it("handles plain strings", () => {
    expect(formatRemoteUrlForStatusBar("  weird-remote.git  ")).toBe(
      "weird-remote",
    );
  });
});
