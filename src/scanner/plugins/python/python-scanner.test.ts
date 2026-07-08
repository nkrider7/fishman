import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../core/types";
import { scanProject } from "../../core/scanner";
import { createRegistry } from "../../core/registry";
import { pythonLanguagePlugin } from "../../language/python-plugin";
import { fastapiScanner } from "./fastapi/fastapi-scanner";
import { flaskScanner } from "./flask/flask-scanner";
import { djangoScanner } from "./django/django-scanner";
import { clearPythonParseCache, parsePythonSource } from "../../parsers/ast/python-parser";
import { detectPythonProject } from "./shared/project-detector";
import { extractSchemasFromModules } from "./shared/schema-extractor";

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

const FASTAPI_PROJECT = {
  "/project/requirements.txt": "fastapi>=0.100.0\nuvicorn>=0.23.0\npydantic>=2.0.0\n",
  "/project/main.py": `
from fastapi import FastAPI, APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr

app = FastAPI()
auth_router = APIRouter(prefix="/auth")

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    age: int | None = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

@auth_router.post("/login", tags=["Auth"], summary="Login user")
async def login(body: LoginRequest):
    """Authenticate user credentials."""
    pass

@auth_router.get("/me", tags=["Auth"])
async def me(token: str = Depends(oauth2_scheme)):
    pass

users_router = APIRouter(prefix="/users")

@users_router.post("", tags=["Users"])
async def create_user(user: UserCreate):
    pass

@users_router.get("/{user_id}", tags=["Users"])
async def get_user(user_id: int, q: str = Query(None)):
    pass

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")

@app.get("/health", tags=["Health"])
async def health():
    pass
`,
};

const FLASK_PROJECT = {
  "/project/requirements.txt": "flask>=3.0.0\n",
  "/project/app.py": `
from flask import Flask, Blueprint, request

app = Flask(__name__)
api = Blueprint("api", __name__, url_prefix="/api")

@api.route("/users", methods=["POST"])
def create_user():
    data = request.json
    return data

@api.route("/users/<int:user_id>", methods=["GET"])
def get_user(user_id):
    return {"id": user_id}

app.register_blueprint(api)

@app.route("/health")
def health():
    return "ok"
`,
};

const DJANGO_PROJECT = {
  "/project/requirements.txt": "django>=4.0\ndjangorestframework>=3.14\n",
  "/project/config/urls.py": `
from django.urls import path, include

urlpatterns = [
    path("api/v1/", include("users.urls")),
]
`,
  "/project/users/urls.py": `
from django.urls import path
from .views import UserListView

urlpatterns = [
    path("users/", UserListView.as_view()),
    path("users/<int:pk>/", UserListView.as_view()),
]
`,
  "/project/users/views.py": `
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import UserSerializer

class UserListView(APIView):
    def get(self, request):
        return Response({})

    def post(self, request):
        return Response({})

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["email", "name"]
`,
};

describe("Python project detection", () => {
  it("detects FastAPI from requirements.txt", async () => {
    const fs = createMemoryFs({ "/project/requirements.txt": "fastapi\n" });
    const project = await detectPythonProject(fs, "/project");
    expect(project.dependencies.fastapi).toBeDefined();
    expect(project.framework).toBe("fastapi");
  });

  it("continues when .env access is forbidden (Tauri sandbox)", async () => {
    const baseFs = createMemoryFs({
      "/project/requirements.txt": "fastapi\n",
      "/project/.env": "BASE_URL=http://localhost:8000\n",
      "/project/main.py": `
from fastapi import FastAPI
app = FastAPI()
@app.get("/health")
def health():
    pass
`,
    });
    const fs: FileSystemAdapter = {
      ...baseFs,
      async exists(path: string) {
        if (path.endsWith("/.env")) {
          throw new Error(
            "forbidden path: .env, maybe it is not allowed on the scope for `allow-exists`",
          );
        }
        return baseFs.exists(path);
      },
      async readFile(path: string) {
        if (path.endsWith("/.env")) {
          throw new Error("forbidden path: .env");
        }
        return baseFs.readFile(path);
      },
    };

    const project = await detectPythonProject(fs, "/project");
    expect(project.framework).toBe("fastapi");
    expect(project.environment.BASE_URL).toBeUndefined();

    const endpoints = await fastapiScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["fastapi"],
    });
    expect(endpoints.length).toBeGreaterThan(0);
  });
});

describe("FastAPI scanner", () => {
  it("discovers routes with prefixes, tags, and request bodies", async () => {
    clearPythonParseCache();
    const fs = createMemoryFs(FASTAPI_PROJECT);
    const endpoints = await fastapiScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["fastapi"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("POST /api/v1/auth/login");
    expect(paths).toContain("GET /api/v1/auth/me");
    expect(paths).toContain("POST /api/v1/users");
    expect(paths).toContain("GET /api/v1/users/{user_id}");
    expect(paths).toContain("GET /health");

    const login = endpoints.find((ep) => ep.path.endsWith("/login"));
    expect(login?.folder).toContain("Auth");
    expect(login?.requestBody?.contentType).toBe("application/json");
    expect(login?.requestBody?.schema).toMatchObject({ email: "john@example.com", password: "" });
    expect(login?.authentication).toBeUndefined();

    const me = endpoints.find((ep) => ep.path.endsWith("/me"));
    expect(me?.authentication?.type).toBe("bearer");
  });
});

describe("Flask scanner", () => {
  it("discovers blueprint and app routes", async () => {
    clearPythonParseCache();
    const fs = createMemoryFs(FLASK_PROJECT);
    const endpoints = await flaskScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["flask"],
    });

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths).toContain("POST /api/users");
    expect(paths).toContain("GET /api/users/{user_id}");
    expect(paths).toContain("GET /health");
  });
});

describe("Django scanner", () => {
  it("discovers urlpatterns routes", async () => {
    clearPythonParseCache();
    const fs = createMemoryFs(DJANGO_PROJECT);
    const endpoints = await djangoScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["django"],
    });

    expect(endpoints.length).toBeGreaterThan(0);
    const paths = endpoints.map((ep) => ep.path);
    expect(paths.some((p) => p.includes("users"))).toBe(true);
  });
});

describe("Pydantic schema extraction", () => {
  it("extracts fields and required flags from BaseModel classes", () => {
    const source = `
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    age: Optional[int] = None
`;
    const mod = parsePythonSource(source, "schemas.py")!;
    const schemas = extractSchemasFromModules([mod]);
    const user = schemas.get("UserCreate");
    expect(user).toBeDefined();
    expect(user!.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["email", "password", "age"]),
    );
    const age = user!.fields.find((f) => f.name === "age");
    expect(age?.required).toBe(false);
    const email = user!.fields.find((f) => f.name === "email");
    expect(email?.required).toBe(true);
  });
});

describe("scanProject integration", () => {
  it("detects Python language and scans FastAPI project", async () => {
    clearPythonParseCache();
    const fs = createMemoryFs(FASTAPI_PROJECT);
    const registry = createRegistry();
    registry.registerLanguage(pythonLanguagePlugin);

    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("python");
    expect(result.frameworks).toContain("fastapi");
    expect(result.endpoints.length).toBeGreaterThan(0);
  });
});
