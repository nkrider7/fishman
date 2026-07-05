import type { FrameworkPlugin } from "../../core/types";
import { getAllDependencies } from "../../utils/file-discovery";
import { scanWithRoutePatterns } from "./shared/route-scanner";

function hasDep(ctx: { packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } }, name: string): boolean {
  if (!ctx.packageJson) return false;
  const deps = getAllDependencies(ctx.packageJson);
  return name in deps;
}

export const expressScanner: FrameworkPlugin = {
  id: "express",
  name: "Express",
  languageId: "node",
  async detect(ctx) {
    return hasDep(ctx, "express");
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "express", {
      receivers: ["router", "app", "route", "api"],
    });
  },
};

export const fastifyScanner: FrameworkPlugin = {
  id: "fastify",
  name: "Fastify",
  languageId: "node",
  async detect(ctx) {
    return hasDep(ctx, "fastify");
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "fastify", {
      receivers: ["fastify", "app", "server", "instance"],
    });
  },
};

export const koaScanner: FrameworkPlugin = {
  id: "koa",
  name: "Koa",
  languageId: "node",
  async detect(ctx) {
    return hasDep(ctx, "koa");
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "koa", {
      receivers: ["router", "app"],
    });
  },
};

export const honoScanner: FrameworkPlugin = {
  id: "hono",
  name: "Hono",
  languageId: "node",
  async detect(ctx) {
    return hasDep(ctx, "hono");
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "hono", {
      receivers: ["app", "hono"],
      allowBareCalls: true,
    });
  },
};

export const elysiaScanner: FrameworkPlugin = {
  id: "elysia",
  name: "Elysia",
  languageId: "node",
  async detect(ctx) {
    return hasDep(ctx, "elysia");
  },
  async scan(ctx) {
    return scanWithRoutePatterns(ctx, "elysia", {
      receivers: ["app", "elysia"],
    });
  },
};
