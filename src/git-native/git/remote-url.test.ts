import { describe, expect, it } from "vitest";
import { normalizeRemoteUrl, isLikelySshRemote } from "./remote-url";

describe("normalizeRemoteUrl", () => {
  it("converts scp-style SSH to HTTPS", () => {
    expect(normalizeRemoteUrl("git@github.com:nkrider7/testfishman.git")).toBe(
      "https://github.com/nkrider7/testfishman.git",
    );
  });

  it("adds https to host/path", () => {
    expect(normalizeRemoteUrl("github.com/nkrider7/testfishman.git")).toBe(
      "https://github.com/nkrider7/testfishman.git",
    );
  });

  it("keeps https URLs", () => {
    expect(
      normalizeRemoteUrl("https://github.com/nkrider7/testfishman.git"),
    ).toBe("https://github.com/nkrider7/testfishman.git");
  });

  it("detects ssh", () => {
    expect(isLikelySshRemote("git@github.com:a/b.git")).toBe(true);
    expect(isLikelySshRemote("https://github.com/a/b.git")).toBe(false);
  });
});
