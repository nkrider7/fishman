import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../../core/types";
import { scanWithRoutePatterns } from "./route-scanner";
import { buildGlobalMountMap } from "./mount-resolver";
import { discoverSourceFiles } from "../../../utils/file-discovery";

function createMemoryFs(files: Record<string, string>): FileSystemAdapter {
  const normalized: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    normalized[path.replace(/\\/g, "/")] = content;
  }

  return {
    async readFile(path: string) {
      const key = path.replace(/\\/g, "/");
      if (!(key in normalized)) throw new Error(`ENOENT: ${path}`);
      return normalized[key];
    },
    async readDir(path: string): Promise<FsDirEntry[]> {
      const prefix = path.replace(/\\/g, "/").replace(/\/$/, "");
      const entries = new Map<string, FsDirEntry>();

      for (const filePath of Object.keys(normalized)) {
        if (!filePath.startsWith(prefix + "/")) continue;
        const rest = filePath.slice(prefix.length + 1);
        const segment = rest.split("/")[0];
        if (!segment) continue;
        const isDirectory = rest.includes("/");
        if (!entries.has(segment)) {
          entries.set(segment, { name: segment, isDirectory });
        } else if (isDirectory) {
          entries.set(segment, { name: segment, isDirectory: true });
        }
      }

      return Array.from(entries.values());
    },
    async exists(path: string) {
      const key = path.replace(/\\/g, "/");
      return Object.keys(normalized).some(
        (f) => f === key || f.startsWith(key + "/"),
      );
    },
    join(...parts: string[]) {
      return parts.join("/").replace(/\/+/g, "/");
    },
    basename(path: string) {
      return path.split("/").pop() ?? path;
    },
    relative(from: string, to: string) {
      const fromParts = from.replace(/\\/g, "/").split("/").filter(Boolean);
      const toParts = to.replace(/\\/g, "/").split("/").filter(Boolean);
      let i = 0;
      while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
      }
      return [...Array(fromParts.length - i).fill(".."), ...toParts.slice(i)].join("/");
    },
  };
}

const EXPRESS_ROUTES = `
import express from "express";
const app = express();
const authRouter = express.Router();

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body;
  res.json({ email, password });
});

authRouter.get("/me", (req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.get("/health", (_req, res) => res.send("ok"));

export default app;
`;

describe("scanWithRoutePatterns", () => {
  it("discovers express routes including custom router variable names", async () => {
    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/auth.ts": EXPRESS_ROUTES,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router", "app"] },
    );

    expect(endpoints.length).toBeGreaterThanOrEqual(3);
    const paths = endpoints.map((ep: { method: string; path: string }) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("POST /auth/login");
    expect(paths).toContain("GET /auth/me");
    expect(paths).toContain("GET /health");

    const login = endpoints.find((ep) => ep.path.endsWith("/login"));
    expect(login?.requestBody?.contentType).toBe("application/json");
    expect(login?.requestBody?.schema).toEqual({ email: "", password: "" });
    expect(login?.requestBody?.example).toBe(
      JSON.stringify({ email: "", password: "" }, null, 2),
    );
  });

  it("resolves cross-file mount prefixes from app.use", async () => {
    const authRoute = `
import { Router } from "express";
const router = Router();
router.post("/register", (_req, res) => res.json({}));
router.get("/me", (_req, res) => res.json({}));
export default router;
`;

    const appFile = `
import express from "express";
import authRouter from "./routes/auth.route";
const app = express();
app.use("/api/auth", authRouter);
export default app;
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/auth.route.ts": authRoute,
      "/project/src/app.ts": appFile,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router", "app"] },
    );

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("POST /api/auth/register");
    expect(paths).toContain("GET /api/auth/me");

    const register = endpoints.find((ep) => ep.path.endsWith("/register"));
    expect(register?.name).toBe("Register");
  });

  it("detects zod validation middleware bodies", async () => {
    const loginSchemaRoute = `
import { z } from "zod";
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
const validate = (schema) => (req, res, next) => next();
router.post("/login", validate(loginSchema), (req, res) => res.json({}));
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/auth.ts": loginSchemaRoute,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0", zod: "^3.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router"] },
    );

    const login = endpoints.find((ep) => ep.path.endsWith("/login"));
    expect(login?.requestBody?.contentType).toBe("application/json");
    expect(login?.requestBody?.schema).toEqual({
      email: "user@example.com",
      password: "",
    });
  });

  it("detects multipart upload middleware", async () => {
    const uploadRoute = `
const upload = { single: (name) => (req, res, next) => next() };
router.post("/avatar", upload.single("avatar"), (req, res) => res.json({}));
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/user.ts": uploadRoute,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router"] },
    );

    const avatar = endpoints.find((ep) => ep.path.endsWith("/avatar"));
    expect(avatar?.requestBody?.contentType).toBe("multipart/form-data");
    expect(avatar?.requestBody?.schema).toEqual({ avatar: "" });
  });

  it("resolves cross-file controller methods with asyncHandler wrapper", async () => {
    const controller = `
export class AuthController {
  login = async (req, res) => {
    const { email, password } = req.body;
    res.json({ ok: true });
  };
}
export default new AuthController();
`;

    const routes = `
import authController from "./auth.controller";
const asyncHandler = (fn) => (req, res, next) => fn(req, res, next);
router.post("/login", asyncHandler(authController.login));
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/controllers/auth.controller.ts": controller,
      "/project/src/routes/auth.ts": routes,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router"] },
    );

    const login = endpoints.find((ep) => ep.path.endsWith("/login"));
    expect(login?.requestBody?.schema).toEqual({ email: "", password: "" });
  });

  it("supports router.route().post() chaining", async () => {
    const routes = `
router.route("/logout").post((req, res) => {
  const { refreshToken } = req.body;
  res.json({ refreshToken });
});
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/auth.ts": routes,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router"] },
    );

    const logout = endpoints.find((ep) => ep.path.endsWith("/logout"));
    expect(logout?.method).toBe("POST");
    expect(logout?.requestBody?.schema).toEqual({ refreshToken: "" });
  });

  it("resolves cross-file mount prefixes from fastify.register", async () => {
    const tasksRoute = `
export default async function tasksRoutes(fastify) {
  fastify.get("/:id", async () => ({}));
  fastify.post("/", async () => ({}));
  fastify.patch("/:id", async () => ({}));
  fastify.delete("/:id", async () => ({}));
}
`;

    const appFile = `
import Fastify from "fastify";
import tasksRoutes from "./routes/tasks";

const fastify = Fastify();

fastify.register(tasksRoutes, { prefix: "/tasks" });

export default fastify;
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/tasks.ts": tasksRoute,
      "/project/src/app.ts": appFile,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { fastify: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["fastify"],
      },
      "fastify",
      { receivers: ["fastify", "app", "server", "instance"] },
    );

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /tasks/:id");
    expect(paths).toContain("POST /tasks/");
    expect(paths).toContain("PATCH /tasks/:id");
    expect(paths).toContain("DELETE /tasks/:id");

    const getById = endpoints.find(
      (ep) => ep.method === "GET" && ep.path === "/tasks/:id",
    );
    expect(getById?.name).toBe("Id");
  });

  it("buildGlobalMountMap chains nested fastify register prefixes", async () => {
    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/tasks.ts": "export default async function () {}",
      "/project/src/routes/index.ts": `
import tasksRoutes from "./tasks";
export default async function routes(fastify) {
  fastify.register(tasksRoutes, { prefix: "/tasks" });
}
`,
      "/project/src/app.ts": `
import routes from "./routes";
const fastify = {};
fastify.register(routes, { prefix: "/api" });
`,
    });

    const files = await discoverSourceFiles(fs, "/project");
    const mounts = await buildGlobalMountMap(fs, files);

    expect(mounts.get("src/routes/tasks.ts")).toBe("/api/tasks");
    expect(mounts.get("src/routes/index.ts")).toBe("/api");
  });

  it("resolves nested fastify.register prefix chains", async () => {
    const tasksRoute = `
export default async function tasksRoutes(instance) {
  instance.get("/:id", async () => ({}));
}
`;

    const routesIndex = `
import tasksRoutes from "./tasks";

export default async function routes(fastify) {
  fastify.register(tasksRoutes, { prefix: "/tasks" });
}
`;

    const appFile = `
import Fastify from "fastify";
import routes from "./routes";

const fastify = Fastify();
fastify.register(routes, { prefix: "/api" });
export default fastify;
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/tasks.ts": tasksRoute,
      "/project/src/routes/index.ts": routesIndex,
      "/project/src/app.ts": appFile,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { fastify: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["fastify"],
      },
      "fastify",
      { receivers: ["fastify", "app", "server", "instance"] },
    );

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /api/tasks/:id");
  });

  it("infers body from route path when handler has no destructuring", async () => {
    const routes = `
router.post("/register", (_req, res) => res.json({ ok: true }));
`;

    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/routes/auth.ts": routes,
    });

    const endpoints = await scanWithRoutePatterns(
      {
        projectPath: "/project",
        fs,
        packageJson: { dependencies: { express: "^4.0.0" } },
        options: { projectPath: "/project" },
        detectedFrameworks: ["express"],
      },
      "express",
      { receivers: ["router"] },
    );

    const register = endpoints.find((ep) => ep.path.endsWith("/register"));
    expect(register?.requestBody?.schema).toEqual({
      email: "user@example.com",
      password: "",
      name: "",
    });
  });
});
