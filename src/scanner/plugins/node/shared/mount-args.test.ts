import { describe, expect, it } from "vitest";
import * as t from "@babel/types";
import { parseUseCall } from "./mount-args";

describe("parseUseCall", () => {
  it("parses app.use(path, router)", () => {
    const result = parseUseCall("app", [
      t.stringLiteral("/api/v1/auth"),
      t.identifier("authRoutes"),
    ]);
    expect(result).toEqual({
      parent: "app",
      mountPath: "/api/v1/auth",
      routerIdent: expect.objectContaining({ name: "authRoutes" }),
    });
  });

  it("parses app.use(path, middleware, router)", () => {
    const result = parseUseCall("app", [
      t.stringLiteral("/api/v1/auth"),
      t.identifier("authRateLimiter"),
      t.identifier("authRoutes"),
    ]);
    expect(result?.routerIdent.name).toBe("authRoutes");
    expect(result?.mountPath).toBe("/api/v1/auth");
  });

  it("parses app.use(path, middleware(), router)", () => {
    const result = parseUseCall("app", [
      t.stringLiteral("/api/v1/profile"),
      t.callExpression(t.identifier("rateLimiter"), []),
      t.identifier("profileRoutes"),
    ]);
    expect(result?.routerIdent.name).toBe("profileRoutes");
    expect(result?.mountPath).toBe("/api/v1/profile");
  });

  it("parses router.use(subRouter) without path", () => {
    const result = parseUseCall("router", [t.identifier("authRouter")]);
    expect(result?.routerIdent.name).toBe("authRouter");
    expect(result?.mountPath).toBe("");
  });

  it("returns null for middleware-only use calls", () => {
    const result = parseUseCall("app", [
      t.callExpression(t.identifier("cors"), []),
    ]);
    expect(result).toBeNull();
  });
});
