import { describe, expect, it } from "vitest";
import {
  formatGitHubRepoLabel,
  parseGitHubRepoUrl,
  GitHubUrlError,
} from "./parse-repo-url";

describe("parseGitHubRepoUrl", () => {
  it("parses https urls with .git", () => {
    expect(
      parseGitHubRepoUrl(
        "https://github.com/gothinkster/spring-boot-realworld-example-app.git",
      ),
    ).toEqual({
      host: "github.com",
      owner: "gothinkster",
      repo: "spring-boot-realworld-example-app",
      ref: undefined,
      subpath: undefined,
    });
  });

  it("parses tree urls with ref and subpath", () => {
    expect(
      parseGitHubRepoUrl(
        "https://github.com/acme/api/tree/develop/backend",
      ),
    ).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "api",
      ref: "develop",
      subpath: "backend",
    });
  });

  it("parses ssh and owner/repo shorthand", () => {
    expect(parseGitHubRepoUrl("git@github.com:acme/api.git")).toMatchObject({
      owner: "acme",
      repo: "api",
    });
    expect(parseGitHubRepoUrl("acme/api")).toMatchObject({
      owner: "acme",
      repo: "api",
    });
  });

  it("rejects non-github hosts", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/acme/api")).toThrow(
      GitHubUrlError,
    );
  });

  it("formats labels", () => {
    expect(
      formatGitHubRepoLabel({
        host: "github.com",
        owner: "a",
        repo: "b",
        ref: "main",
      }),
    ).toBe("a/b@main");
  });
});
