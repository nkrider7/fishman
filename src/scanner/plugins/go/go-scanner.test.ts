import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../core/types";
import { scanProject } from "../../core/scanner";
import { createRegistry } from "../../core/registry";
import { goLanguagePlugin } from "../../language/go-plugin";
import { ginScanner } from "./gin/gin-scanner";
import { echoScanner } from "./echo/echo-scanner";
import { chiScanner } from "./chi/chi-scanner";
import { netHttpScanner } from "./nethttp/nethttp-scanner";
import {
  detectGoProject,
  hasGinDependency,
  hasEchoDependency,
  hasChiDependency,
  parseGoModRequires,
} from "./shared/project-detector";
import {
  joinPaths,
  normalizePath,
  extractPathParamsFromPattern,
} from "./shared/path-utils";
import {
  parseGinEchoMethodCalls,
  parseGoServeMuxPattern,
} from "./shared/route-extractor";
import { extractStructsFromSource } from "./shared/schema-extractor";

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

const GIN_MOD = `
module example.com/demo

go 1.22

require (
  github.com/gin-gonic/gin v1.10.0
)
`;

const ECHO_MOD = `
module example.com/demo

go 1.22

require github.com/labstack/echo/v4 v4.12.0
`;

const CHI_MOD = `
module example.com/demo

go 1.22

require github.com/go-chi/chi/v5 v5.1.0
`;

describe("Go project detection", () => {
  it("detects gin from go.mod", async () => {
    const fs = createMemoryFs({ "/project/go.mod": GIN_MOD });
    const project = await detectGoProject(fs, "/project");
    expect(hasGinDependency(project.dependencies)).toBe(true);
    expect(hasEchoDependency(project.dependencies)).toBe(false);
  });

  it("detects echo and chi with versioned paths", () => {
    expect(hasEchoDependency(parseGoModRequires(ECHO_MOD))).toBe(true);
    expect(hasChiDependency(parseGoModRequires(CHI_MOD))).toBe(true);
  });

  it("normalizes paths and params", () => {
    expect(joinPaths("/api", "/notes", ":id")).toBe("/api/notes/{id}");
    expect(normalizePath("/notes/{id}")).toBe("/notes/{id}");
    expect(extractPathParamsFromPattern("/notes/:id")).toHaveLength(1);
  });

  it("extracts struct json tags", () => {
    const schemas = extractStructsFromSource(
      `
type CreateNote struct {
  Title   string \`json:"title"\`
  Content string \`json:"content"\`
  Secret  string \`json:"-"\`
}
`,
      "note.go",
    );
    expect(schemas[0].fields.map((f) => f.name)).toEqual(["title", "content"]);
  });
});

describe("Gin scanner", () => {
  const GIN_MAIN = `
package main

import "github.com/gin-gonic/gin"

type CreateNote struct {
  Title   string \`json:"title"\`
  Content string \`json:"content"\`
}

func health(c *gin.Context) {}
func listNotes(c *gin.Context) {}
func createNote(c *gin.Context) {
  var req CreateNote
  c.ShouldBindJSON(&req)
}
func getNote(c *gin.Context) {
  _ = c.Param("id")
}
func updateNote(c *gin.Context) {
  var req CreateNote
  c.ShouldBindJSON(&req)
}

func main() {
  r := gin.Default()
  r.GET("/health", health)
  api := r.Group("/api")
  {
    api.GET("/notes", listNotes)
    api.POST("/notes", createNote)
    api.GET("/notes/:id", getNote)
    notes := api.Group("/notes")
    notes.PATCH("/:id", updateNote)
  }
}
`;

  it("extracts nested groups, bodies, and path params", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": GIN_MAIN,
    });

    expect(await ginScanner.detect({ projectPath: "/project", fs })).toBe(true);

    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /health");
    expect(paths).toContain("GET /api/notes");
    expect(paths).toContain("POST /api/notes");
    expect(paths).toContain("GET /api/notes/{id}");
    expect(paths).toContain("PATCH /api/notes/{id}");

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.requestBody?.contentType).toBe("application/json");
    expect(create?.requestBody?.schema).toMatchObject({ title: "", content: "" });

    const get = endpoints.find((ep) => ep.method === "GET" && ep.path === "/api/notes/{id}");
    expect(get?.pathParameters.some((p) => p.name === "id")).toBe(true);

    expect(endpoints.every((ep) => ep.folder[0] !== "General" || ep.path === "/health")).toBe(true);
  });

  it("does not leak methods across adjacent routes", () => {
    const source = `
r.GET("/health", health)
r.POST("/notes", create)
r.PATCH("/notes/:id", update)
r.DELETE("/notes/:id", del)
`;
    const calls = parseGinEchoMethodCalls(source);
    const health = calls.filter((c) => c.path === "/health");
    expect(health.map((c) => c.method)).toEqual(["GET"]);
  });

  it("does not crash on malformed files", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": GIN_MAIN,
      "/project/broken.go": `package main\nfunc broken( {\n`,
    });
    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it("dedupes identical method+path", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/a.go": `
package main
import "github.com/gin-gonic/gin"
func a(c *gin.Context) {}
func init() { r := gin.New(); r.GET("/dup", a) }
`,
      "/project/b.go": `
package main
import "github.com/gin-gonic/gin"
func b(c *gin.Context) {}
func init2() { r := gin.New(); r.GET("/dup", b) }
`,
    });
    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });
    expect(endpoints.filter((ep) => ep.path === "/dup" && ep.method === "GET")).toHaveLength(1);
  });
});

describe("Echo scanner", () => {
  it("extracts groups and Bind body", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": ECHO_MOD,
      "/project/main.go": `
package main

import (
  "github.com/labstack/echo/v4"
)

type CreateNote struct {
  Title string \`json:"title"\`
}

func createNote(c echo.Context) error {
  var req CreateNote
  c.Bind(&req)
  return nil
}

func listNotes(c echo.Context) error { return nil }
func health(c echo.Context) error { return nil }

func main() {
  e := echo.New()
  e.GET("/health", health)
  api := e.Group("/api")
  api.GET("/notes", listNotes)
  api.POST("/notes", createNote)
}
`,
    });

    expect(await echoScanner.detect({ projectPath: "/project", fs })).toBe(true);
    const endpoints = await echoScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["echo"],
    });

    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toEqual(
      expect.arrayContaining(["GET /health", "GET /api/notes", "POST /api/notes"]),
    );
    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });

  it("resolves multi-file Register", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": ECHO_MOD,
      "/project/main.go": `
package main
import "github.com/labstack/echo/v4"
func main() {
  e := echo.New()
  api := e.Group("/api")
  notes.Register(api)
}
`,
      "/project/notes/register.go": `
package notes
import "github.com/labstack/echo/v4"

type CreateNote struct {
  Title string \`json:"title"\`
}

func create(c echo.Context) error {
  var req CreateNote
  c.Bind(&req)
  return nil
}

func Register(g *echo.Group) {
  g.POST("/notes", create)
}
`,
    });

    const endpoints = await echoScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["echo"],
    });

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create).toBeDefined();
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });
});

describe("Chi scanner", () => {
  it("extracts nested Route blocks and Decode body", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": CHI_MOD,
      "/project/main.go": `
package main

import (
  "encoding/json"
  "net/http"
  "github.com/go-chi/chi/v5"
)

type CreateNote struct {
  Title string \`json:"title"\`
}

func health(w http.ResponseWriter, r *http.Request) {}
func listNotes(w http.ResponseWriter, r *http.Request) {}
func createNote(w http.ResponseWriter, r *http.Request) {
  var req CreateNote
  json.NewDecoder(r.Body).Decode(&req)
}
func getNote(w http.ResponseWriter, r *http.Request) {
  _ = chi.URLParam(r, "id")
}

func main() {
  r := chi.NewRouter()
  r.Get("/health", health)
  r.Route("/api", func(r chi.Router) {
    r.Get("/notes", listNotes)
    r.Post("/notes", createNote)
    r.Route("/notes", func(r chi.Router) {
      r.Get("/{id}", getNote)
    })
  })
}
`,
    });

    expect(await chiScanner.detect({ projectPath: "/project", fs })).toBe(true);
    const endpoints = await chiScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["chi"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /health");
    expect(paths).toContain("GET /api/notes");
    expect(paths).toContain("POST /api/notes");
    expect(paths).toContain("GET /api/notes/{id}");

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });

  it("resolves multi-file notes.Routes under /api", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": CHI_MOD,
      "/project/main.go": `
package main
import "github.com/go-chi/chi/v5"
func main() {
  r := chi.NewRouter()
  r.Route("/api", notes.Routes)
}
`,
      "/project/notes/routes.go": `
package notes
import (
  "encoding/json"
  "net/http"
  "github.com/go-chi/chi/v5"
)

type CreateNote struct {
  Title string \`json:"title"\`
}

func create(w http.ResponseWriter, r *http.Request) {
  var req CreateNote
  json.NewDecoder(r.Body).Decode(&req)
}

func Routes(r chi.Router) {
  r.Post("/notes", create)
}
`,
    });

    const endpoints = await chiScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["chi"],
    });

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create).toBeDefined();
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });
});

describe("Gin hardening: nested empty paths + realistic bodies", () => {
  it("handles notes.POST(\"\", create) under nested groups with ShouldBindJSON", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": `
package main
import "github.com/gin-gonic/gin"

type CreateNote struct {
  Title   string \`json:"title"\`
  Content string \`json:"content"\`
  Done    bool   \`json:"done"\`
}

func createNote(c *gin.Context) {
  var req CreateNote
  if err := c.ShouldBindJSON(&req); err != nil {
    return
  }
}
func getNote(c *gin.Context) {}
func listNotes(c *gin.Context) {}

func main() {
  r := gin.Default()
  api := r.Group("/api")
  v1 := api.Group("/v1")
  notes := v1.Group("/notes")
  notes.GET("", listNotes)
  notes.POST("", createNote)
  notes.GET("/:id", getNote)
}
`,
    });

    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("GET /api/v1/notes");
    expect(paths).toContain("POST /api/v1/notes");
    expect(paths).toContain("GET /api/v1/notes/{id}");

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/v1/notes");
    expect(create?.requestBody?.schema).toMatchObject({
      title: "",
      content: "",
      done: false,
    });
  });

  it("resolves package-qualified models + new(Type) body binding", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/models/note.go": `
package models
type CreateNote struct {
  Title string \`json:"title"\`
}
`,
      "/project/handlers/note.go": `
package handlers
import (
  "github.com/gin-gonic/gin"
  "example.com/demo/models"
)
func Create(c *gin.Context) {
  req := new(models.CreateNote)
  c.ShouldBindJSON(req)
}
`,
      "/project/main.go": `
package main
import "github.com/gin-gonic/gin"
func main() {
  r := gin.New()
  api := r.Group("/api")
  api.POST("/notes", handlers.Create)
}
`,
    });

    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.handler).toBe("handlers.Create");
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });

  it("supports chained Group().GET and middleware without stealing handler", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": `
package main
import "github.com/gin-gonic/gin"

type LoginRequest struct {
  Email string \`json:"email"\`
}

func login(c *gin.Context) {
  var req LoginRequest
  c.ShouldBindJSON(&req)
}
func Auth() gin.HandlerFunc { return func(c *gin.Context) {} }

func main() {
  r := gin.New()
  r.Group("/api").POST("/login", Auth(), login)
}
`,
    });

    const endpoints = await ginScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["gin"],
    });

    const loginEp = endpoints.find((ep) => ep.path === "/api/login" && ep.method === "POST");
    expect(loginEp?.handler).toBe("login");
    expect(loginEp?.requestBody?.schema).toMatchObject({ email: "" });
  });
});

describe("Echo hardening: nested groups + Bind bodies", () => {
  it("handles nested groups with empty path and c.Bind", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": ECHO_MOD,
      "/project/main.go": `
package main
import "github.com/labstack/echo/v4"

type CreateUser struct {
  Email    string \`json:"email"\`
  Password string \`json:"password"\`
}

func createUser(c echo.Context) error {
  var req CreateUser
  if err := c.Bind(&req); err != nil {
    return err
  }
  return nil
}
func listUsers(c echo.Context) error { return nil }

func main() {
  e := echo.New()
  api := e.Group("/api")
  users := api.Group("/users")
  users.GET("", listUsers)
  users.POST("", createUser)
  users.GET("/:id", listUsers)
}
`,
    });

    const endpoints = await echoScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["echo"],
    });

    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toEqual(
      expect.arrayContaining([
        "GET /api/users",
        "POST /api/users",
        "GET /api/users/{id}",
      ]),
    );
    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/users");
    expect(create?.requestBody?.schema).toMatchObject({
      email: "",
      password: "",
    });
  });

  it("resolves Register(e.Group(\"/api\")) cross-file", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": ECHO_MOD,
      "/project/main.go": `
package main
import "github.com/labstack/echo/v4"
func main() {
  e := echo.New()
  notes.Register(e.Group("/api"))
}
`,
      "/project/notes/register.go": `
package notes
import "github.com/labstack/echo/v4"

type CreateNote struct {
  Title string \`json:"title"\`
}

func create(c echo.Context) error {
  req := &CreateNote{}
  c.Bind(req)
  return nil
}

func Register(g *echo.Group) {
  g.POST("/notes", create)
}
`,
    });

    const endpoints = await echoScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["echo"],
    });

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
  });
});

const STD_MOD = `
module example.com/demo

go 1.22
`;

describe("net/http scanner", () => {
  it("detects classic HandleFunc as GET /health", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"
func health(w http.ResponseWriter, r *http.Request) {}
func main() {
  http.HandleFunc("/health", health)
}
`,
    });
    expect(await netHttpScanner.detect({ projectPath: "/project", fs })).toBe(true);
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toContain("GET /health");
  });

  it("parses Go 1.22 method patterns and path params", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import (
  "encoding/json"
  "net/http"
)

type CreateUser struct {
  Email string \`json:"email"\`
  Name  string \`json:"name"\`
}

func listUsers(w http.ResponseWriter, r *http.Request) {}
func createUser(w http.ResponseWriter, r *http.Request) {
  var req CreateUser
  json.NewDecoder(r.Body).Decode(&req)
}
func getUser(w http.ResponseWriter, r *http.Request) {
  id := r.PathValue("id")
  _ = id
}

func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("GET /users", listUsers)
  mux.HandleFunc("POST /users", createUser)
  mux.HandleFunc("GET /users/{id}", getUser)
  http.ListenAndServe(":8080", mux)
}
`,
    });
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toEqual(
      expect.arrayContaining([
        "GET /users",
        "POST /users",
        "GET /users/{id}",
      ]),
    );
    const get = endpoints.find((ep) => ep.method === "GET" && ep.path === "/users/{id}");
    expect(get?.pathParameters.some((p) => p.name === "id")).toBe(true);
    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/users");
    expect(create?.requestBody?.schema).toMatchObject({ email: "", name: "" });
  });

  it("resolves nested StripPrefix mounts", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"

func listNotes(w http.ResponseWriter, r *http.Request) {}
func createNote(w http.ResponseWriter, r *http.Request) {}

func main() {
  api := http.NewServeMux()
  api.HandleFunc("GET /notes", listNotes)
  api.HandleFunc("POST /notes", createNote)

  mux := http.NewServeMux()
  mux.Handle("/api/", http.StripPrefix("/api", api))
  http.ListenAndServe(":8080", mux)
}
`,
    });
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toEqual(
      expect.arrayContaining(["GET /api/notes", "POST /api/notes"]),
    );
    expect(endpoints.some((ep) => ep.path === "/notes")).toBe(false);
  });

  it("resolves cross-file Routes() returning http.Handler", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"
func main() {
  mux := http.NewServeMux()
  mux.Handle("/api/", http.StripPrefix("/api", notes.Routes()))
  http.ListenAndServe(":8080", mux)
}
`,
      "/project/notes/routes.go": `
package notes
import (
  "encoding/json"
  "net/http"
)

type CreateNote struct {
  Title string \`json:"title"\`
}

func create(w http.ResponseWriter, r *http.Request) {
  req := &CreateNote{}
  json.NewDecoder(r.Body).Decode(req)
}

func Routes() http.Handler {
  m := http.NewServeMux()
  m.HandleFunc("POST /notes", create)
  m.HandleFunc("GET /notes", func(w http.ResponseWriter, r *http.Request) {})
  return m
}
`,
    });
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/notes");
    expect(create?.requestBody?.schema).toMatchObject({ title: "" });
    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toContain("GET /api/notes");
  });

  it("infers multiple methods from handler switch", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"

func users(w http.ResponseWriter, r *http.Request) {
  switch r.Method {
  case http.MethodGet:
    // list
  case http.MethodPost:
    // create
  case http.MethodDelete:
    // delete
  }
}

func main() {
  http.HandleFunc("/users", users)
}
`,
    });
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints.map((ep) => `${ep.method} ${ep.path}`)).toEqual(
      expect.arrayContaining([
        "GET /users",
        "POST /users",
        "DELETE /users",
      ]),
    );
  });

  it("skips FileServer registrations", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"
func health(w http.ResponseWriter, r *http.Request) {}
func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("GET /health", health)
  mux.Handle("/static/", http.FileServer(http.Dir("static")))
}
`,
    });
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints.map((ep) => ep.path)).toEqual(["/health"]);
    expect(endpoints.some((ep) => ep.path.includes("static"))).toBe(false);
  });

  it("does not steal Gin routes as net/http", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": `
package main
import "github.com/gin-gonic/gin"
func health(c *gin.Context) {}
func main() {
  r := gin.New()
  r.GET("/health", health)
}
`,
    });
    expect(await netHttpScanner.detect({ projectPath: "/project", fs })).toBe(false);
    const endpoints = await netHttpScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["nethttp"],
    });
    expect(endpoints).toHaveLength(0);
  });

  it("parses Go 1.22 pattern helper", () => {
    expect(parseGoServeMuxPattern("GET /users/{id}")).toEqual({
      method: "GET",
      path: "/users/{id}",
    });
    expect(parseGoServeMuxPattern("GET /{$}")).toEqual({
      method: "GET",
      path: "/",
    });
    expect(parseGoServeMuxPattern("/files/{path...}")).toEqual({
      method: undefined,
      path: "/files/{path}",
    });
  });
});

describe("scanProject integration (Go)", () => {
  it("detects Go + Gin end-to-end", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": GIN_MOD,
      "/project/main.go": `
package main
import "github.com/gin-gonic/gin"
func health(c *gin.Context) {}
func main() {
  r := gin.New()
  r.GET("/health", health)
}
`,
    });
    const registry = createRegistry();
    registry.registerLanguage(goLanguagePlugin);
    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("go");
    expect(result.frameworks).toContain("gin");
    expect(result.endpoints.some((ep) => ep.path === "/health")).toBe(true);
  });

  it("detects Go + net/http end-to-end", async () => {
    const fs = createMemoryFs({
      "/project/go.mod": STD_MOD,
      "/project/main.go": `
package main
import "net/http"
func health(w http.ResponseWriter, r *http.Request) {}
func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("GET /health", health)
  http.ListenAndServe(":8080", mux)
}
`,
    });
    const registry = createRegistry();
    registry.registerLanguage(goLanguagePlugin);
    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("go");
    expect(result.frameworks).toContain("nethttp");
    expect(result.endpoints.some((ep) => ep.method === "GET" && ep.path === "/health")).toBe(
      true,
    );
  });
});
