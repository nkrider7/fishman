import { describe, expect, it } from "vitest";
import {
  buildCookieHeader,
  cookieMatchesUrl,
  domainMatches,
  parseSetCookieHeader,
  pathMatches,
  selectCookiesForUrl,
} from "./cookies";
import type { StoredCookie } from "@/types/cookie";

function cookie(partial: Partial<StoredCookie> & Pick<StoredCookie, "name" | "domain">): StoredCookie {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? "1",
    domain: partial.domain,
    name: partial.name,
    value: partial.value ?? "v",
    path: partial.path ?? "/",
    expires: partial.expires ?? null,
    secure: partial.secure ?? false,
    httpOnly: partial.httpOnly ?? false,
    sameSite: partial.sameSite ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe("parseSetCookieHeader", () => {
  it("parses name, value, and flags", () => {
    const parsed = parseSetCookieHeader(
      "session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
      "https://api.example.com/v1/users",
    );
    expect(parsed).toMatchObject({
      name: "session",
      value: "abc123",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      domain: "api.example.com",
    });
  });

  it("normalizes Domain with leading dot", () => {
    const parsed = parseSetCookieHeader(
      "AEC=xyz; Domain=google.com; Path=/",
      "https://www.google.com/",
    );
    expect(parsed?.domain).toBe(".google.com");
  });

  it("uses Max-Age over Expires", () => {
    const parsed = parseSetCookieHeader(
      "x=1; Max-Age=60; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
      "https://example.com/",
    );
    expect(parsed?.expires).toBeTruthy();
    const ts = Date.parse(parsed!.expires!);
    expect(ts).toBeGreaterThan(Date.now());
  });
});

describe("domainMatches", () => {
  it("matches host-only exactly", () => {
    expect(domainMatches("api.example.com", "api.example.com")).toBe(true);
    expect(domainMatches("api.example.com", "example.com")).toBe(false);
  });

  it("matches subdomain cookies with leading dot", () => {
    expect(domainMatches(".example.com", "example.com")).toBe(true);
    expect(domainMatches(".example.com", "api.example.com")).toBe(true);
    expect(domainMatches(".example.com", "evil.com")).toBe(false);
  });
});

describe("pathMatches", () => {
  it("matches path prefixes correctly", () => {
    expect(pathMatches("/", "/anything")).toBe(true);
    expect(pathMatches("/docs", "/docs")).toBe(true);
    expect(pathMatches("/docs", "/docs/guide")).toBe(true);
    expect(pathMatches("/docs", "/documentation")).toBe(false);
  });
});

describe("cookieMatchesUrl / selectCookiesForUrl", () => {
  it("ignores expired and secure-mismatched cookies", () => {
    const cookies = [
      cookie({ name: "ok", domain: "example.com", path: "/" }),
      cookie({
        name: "old",
        domain: "example.com",
        expires: new Date(0).toISOString(),
      }),
      cookie({ name: "sec", domain: "example.com", secure: true }),
    ];

    const matched = selectCookiesForUrl(cookies, "http://example.com/");
    expect(matched.map((c) => c.name)).toEqual(["ok"]);
  });

  it("builds Cookie header with unique names", () => {
    const header = buildCookieHeader([
      cookie({ name: "a", domain: "x", value: "1", path: "/app" }),
      cookie({ name: "a", domain: "x", value: "2", path: "/" }),
      cookie({ name: "b", domain: "x", value: "3" }),
    ]);
    expect(header).toBe("a=1; b=3");
  });

  it("matches subdomain cookie on https", () => {
    const c = cookie({
      name: "NID",
      domain: ".google.com",
      secure: true,
      path: "/",
    });
    expect(cookieMatchesUrl(c, "https://www.google.com/search")).toBe(true);
  });
});
