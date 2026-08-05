import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../core/types";
import { scanProject } from "../../core/scanner";
import { createRegistry } from "../../core/registry";
import { rustLanguagePlugin } from "../../language/rust-plugin";
import {
  extractRustStringLiteral,
  resolveChainScopePrefixes,
} from "./shared/route-extractor";
import { actixScanner, extractActixRoutesFromSource } from "./actix/actix-scanner";
import { axumScanner } from "./axum/axum-scanner";
import {
  detectRustProject,
  hasActixDependency,
  hasAxumDependency,
  parseCargoDependencies,
} from "./shared/project-detector";
import { joinPaths, normalizePath, extractPathParamsFromPattern } from "./shared/path-utils";

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

const ACTIX_CARGO = `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
actix-web = "4"
serde = "1"
`;

const AXUM_CARGO = `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
`;

const ACTIX_MAIN = `
use actix_web::{web, App, HttpServer, get, post};

#[get("/health")]
async fn health() -> &'static str {
    "ok"
}

#[post("/users")]
async fn create_user() -> &'static str {
    "created"
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/items", web::get().to(list_items))
            .service(
                web::resource("/users")
                    .route(web::get().to(list_users))
                    .route(web::post().to(create_user))
            )
    );
}

async fn list_items() -> &'static str { "items" }
async fn list_users() -> &'static str { "users" }

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/ping", web::get().to(health))
            .configure(configure)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
`;

const AXUM_MAIN = `
use axum::{routing::{get, post, put}, Router};

async fn list_users() -> &'static str { "users" }
async fn create_user() -> &'static str { "created" }
async fn get_user() -> &'static str { "user" }

fn api_routes() -> Router {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:id", get(get_user).put(update_user))
}

async fn update_user() -> &'static str { "updated" }

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .nest("/api", api_routes());

    // axum::serve(...)
}
`;

const BROKEN_RUST = `
#[get("/broken"
async fn broken(
`;

describe("Rust project detection", () => {
  it("detects actix-web from Cargo.toml", async () => {
    const fs = createMemoryFs({ "/project/Cargo.toml": ACTIX_CARGO });
    const project = await detectRustProject(fs, "/project");
    expect(hasActixDependency(project.dependencies)).toBe(true);
    expect(hasAxumDependency(project.dependencies)).toBe(false);
  });

  it("detects axum from Cargo.toml", async () => {
    const fs = createMemoryFs({ "/project/Cargo.toml": AXUM_CARGO });
    const project = await detectRustProject(fs, "/project");
    expect(hasAxumDependency(project.dependencies)).toBe(true);
    expect(hasActixDependency(project.dependencies)).toBe(false);
  });

  it("parses inline table dependencies", () => {
    const deps = parseCargoDependencies(`
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = "1"
`);
    expect(deps.tokio).toBe("1");
    expect(deps.serde).toBe("1");
  });
});

describe("Rust path helpers", () => {
  it("joins and normalizes paths", () => {
    expect(joinPaths("/api", "/users", "{id}")).toBe("/api/users/{id}");
    expect(normalizePath("/users/:id")).toBe("/users/{id}");
  });

  it("extracts path params from patterns", () => {
    const params = extractPathParamsFromPattern("/api/users/{id}/posts/{post_id}");
    expect(params.map((p) => p.name)).toEqual(["id", "post_id"]);
  });

  it("extracts Rust string literals including escaped quotes", () => {
    const source = 'route("/api/v1/users")';
    expect(extractRustStringLiteral(source, 6)).toBe("/api/v1/users");
  });
});

describe("Actix scanner", () => {
  it("extracts App::new().route with web::get", () => {
    const source = `
App::new()
    .route("/ping", web::get().to(health))
`;
    const routes = extractActixRoutesFromSource(source, "/project/src/main.rs", "src/main.rs");
    expect(routes.some((r) => r.method === "GET" && r.path === "/ping")).toBe(true);
  });

  it("extracts ping from full actix main sample", () => {
    const routes = extractActixRoutesFromSource(ACTIX_MAIN, "/project/src/main.rs", "src/main.rs");
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("GET /ping");
  });

  it("resolves actix scope prefix for nested resource routes", () => {
    const idx = ACTIX_MAIN.indexOf('resource("/users")');
    expect(idx).toBeGreaterThan(0);
    expect(resolveChainScopePrefixes(ACTIX_MAIN, idx)).toBe("/api");
  });

  it("extracts attribute and route endpoints with nested scopes", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": ACTIX_CARGO,
      "/project/src/main.rs": ACTIX_MAIN,
    });

    expect(await actixScanner.detect({ projectPath: "/project", fs })).toBe(true);

    const endpoints = await actixScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["actix"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /health");
    expect(paths).toContain("POST /users");
    expect(paths).toContain("GET /ping");
    expect(paths).toContain("GET /api/items");
    expect(paths).toContain("GET /api/users");
    expect(paths).toContain("POST /api/users");
  });

  it("does not crash on malformed Rust files", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": ACTIX_CARGO,
      "/project/src/main.rs": ACTIX_MAIN,
      "/project/src/broken.rs": BROKEN_RUST,
    });

    const endpoints = await actixScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["actix"],
    });

    expect(endpoints.length).toBeGreaterThan(0);
  });

  it("dedupes identical method+path pairs", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": ACTIX_CARGO,
      "/project/src/routes.rs": `
#[get("/dup")]
async fn a() {}

#[get("/dup")]
async fn b() {}
`,
    });

    const endpoints = await actixScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["actix"],
    });

    const dups = endpoints.filter((ep) => ep.path === "/dup" && ep.method === "GET");
    expect(dups).toHaveLength(1);
  });
});

describe("Axum scanner", () => {
  it("extracts routes with multiple methods and nested routers", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": AXUM_CARGO,
      "/project/src/main.rs": AXUM_MAIN,
    });

    expect(await axumScanner.detect({ projectPath: "/project", fs })).toBe(true);

    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /health");
    expect(paths).toContain("GET /api/users");
    expect(paths).toContain("POST /api/users");
    expect(paths).toContain("GET /api/users/{id}");
    expect(paths).toContain("PUT /api/users/{id}");
  });

  it("supports multiple HTTP methods on the same route", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": AXUM_CARGO,
      "/project/src/main.rs": `
use axum::{routing::{get, post}, Router};

async fn handler() {}

#[tokio::main]
async fn main() {
    Router::new().route("/resource", get(handler).post(handler));
}
`,
    });

    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const resource = endpoints.filter((ep) => ep.path === "/resource");
    expect(resource.map((ep) => ep.method).sort()).toEqual(["GET", "POST"]);
  });
});

describe("scanProject integration (Rust)", () => {
  it("detects Rust language and scans Actix project end-to-end", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": ACTIX_CARGO,
      "/project/src/main.rs": ACTIX_MAIN,
    });
    const registry = createRegistry();
    registry.registerLanguage(rustLanguagePlugin);

    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("rust");
    expect(result.frameworks).toContain("actix");
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it("detects Rust language and scans Axum project end-to-end", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": AXUM_CARGO,
      "/project/src/main.rs": AXUM_MAIN,
    });
    const registry = createRegistry();
    registry.registerLanguage(rustLanguagePlugin);

    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("rust");
    expect(result.frameworks).toContain("axum");
    expect(result.endpoints.some((ep) => ep.path.startsWith("/api/"))).toBe(true);
  });
});

const MULTI_FILE_AXUM = {
  "/project/Cargo.toml": AXUM_CARGO,
  "/project/src/main.rs": `
mod notes;
mod health;

use axum::Router;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .nest("/api", health::routes())
        .nest("/api", notes::routes());
}
`,
  "/project/src/health.rs": `
use axum::{routing::get, Router};

pub async fn healthcheck() -> &'static str { "ok" }

pub fn routes() -> Router {
    Router::new().route("/healthcheck", get(healthcheck))
}
`,
  "/project/src/notes.rs": `
use axum::{
    extract::{Path, Json},
    routing::{get, post, patch, delete},
    Router,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CreateNote {
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct UpdateNote {
    pub title: Option<String>,
    pub content: Option<String>,
}

pub async fn list_notes() {}
pub async fn create_note(Json(payload): Json<CreateNote>) {}
pub async fn get_note(Path(id): Path<i64>) {}
pub async fn update_note(Path(id): Path<i64>, Json(payload): Json<UpdateNote>) {}
pub async fn delete_note(Path(id): Path<i64>) {}

pub fn routes() -> Router {
    Router::new()
        .route("/notes", get(list_notes).post(create_note))
        .route("/notes/:id", get(get_note).patch(update_note).delete(delete_note))
}
`,
};

describe("Axum hardening: bodies, nests, method bounding, folders", () => {
  it("does not leak methods across adjacent routes (healthcheck vs notes)", async () => {
    const fs = createMemoryFs(MULTI_FILE_AXUM);
    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const health = endpoints.filter((ep) => ep.path === "/api/healthcheck");
    expect(health.map((ep) => ep.method)).toEqual(["GET"]);

    const notePaths = endpoints
      .filter((ep) => ep.path.startsWith("/api/notes"))
      .map((ep) => `${ep.method} ${ep.path}`)
      .sort();
    expect(notePaths).toContain("GET /api/notes");
    expect(notePaths).toContain("POST /api/notes");
    expect(notePaths).toContain("GET /api/notes/{id}");
    expect(notePaths).toContain("PATCH /api/notes/{id}");
    expect(notePaths).toContain("DELETE /api/notes/{id}");
  });

  it("extracts Json<CreateNote> body schema for POST /api/notes", async () => {
    const fs = createMemoryFs(MULTI_FILE_AXUM);
    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const create = endpoints.find(
      (ep) => ep.method === "POST" && ep.path === "/api/notes",
    );
    expect(create?.requestBody?.contentType).toBe("application/json");
    expect(create?.requestBody?.schema).toMatchObject({
      title: "",
      content: "",
    });
    expect(create?.requestBody?.example).toContain("title");
  });

  it("extracts UpdateNote body for PATCH and path param id", async () => {
    const fs = createMemoryFs(MULTI_FILE_AXUM);
    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const update = endpoints.find(
      (ep) => ep.method === "PATCH" && ep.path === "/api/notes/{id}",
    );
    expect(update?.requestBody?.schema).toMatchObject({
      title: "",
      content: "",
    });
    expect(update?.pathParameters.some((p) => p.name === "id")).toBe(true);
  });

  it("uses meaningful folders instead of General for nested routes", async () => {
    const fs = createMemoryFs(MULTI_FILE_AXUM);
    const endpoints = await axumScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["axum"],
    });

    const notes = endpoints.filter((ep) => ep.path.startsWith("/api/notes"));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((ep) => ep.folder[0] !== "General")).toBe(true);
    expect(notes.some((ep) => ep.folder.includes("notes"))).toBe(true);
  });

  it("resolves cross-file notes::routes() under /api nest", async () => {
    const fs = createMemoryFs(MULTI_FILE_AXUM);
    const result = await scanProject(
      fs,
      { projectPath: "/project" },
      (() => {
        const registry = createRegistry();
        registry.registerLanguage(rustLanguagePlugin);
        return registry;
      })(),
    );
    expect(result.frameworks).toContain("axum");
    expect(result.endpoints.some((ep) => ep.path === "/api/notes")).toBe(true);
    expect(result.endpoints.some((ep) => ep.path === "/api/healthcheck")).toBe(true);
  });
});

describe("Actix body extraction", () => {
  it("extracts Json<CreateUser> from #[post] handler", async () => {
    const fs = createMemoryFs({
      "/project/Cargo.toml": ACTIX_CARGO,
      "/project/src/main.rs": `
use actix_web::{post, web, HttpResponse};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CreateUser {
    pub email: String,
    pub password: String,
}

#[post("/users")]
async fn create_user(body: web::Json<CreateUser>) -> HttpResponse {
    HttpResponse::Ok().finish()
}
`,
    });

    const endpoints = await actixScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["actix"],
    });

    const create = endpoints.find(
      (ep) => ep.method === "POST" && ep.path === "/users",
    );
    expect(create?.requestBody?.contentType).toBe("application/json");
    expect(create?.requestBody?.schema).toMatchObject({
      email: "",
      password: "",
    });
  });
});

describe("bounded method parsing", () => {
  it("parseAxumRouteCall only returns methods for that route", async () => {
    const { parseAxumRouteCall } = await import("./shared/route-extractor");
    const source = `
Router::new()
    .route("/healthcheck", get(healthcheck))
    .route("/notes", get(list).post(create).patch(update).delete(remove))
`;
    const healthIdx = source.indexOf('.route("/healthcheck"');
    const health = parseAxumRouteCall(source, healthIdx);
    expect(health?.methods.map((m) => m.method)).toEqual(["GET"]);

    const notesIdx = source.indexOf('.route("/notes"');
    const notes = parseAxumRouteCall(source, notesIdx);
    expect(notes?.methods.map((m) => m.method).sort()).toEqual([
      "DELETE",
      "GET",
      "PATCH",
      "POST",
    ]);
  });
});
