import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../../core/types";
import { nestjsScanner } from "./nestjs-scanner";

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

const AUTH_CONTROLLER = `
import { Body, Controller, Post } from "@nestjs/common";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";

@Controller()
export class AuthController {
  @Post("login")
  login(@Body() loginDto: LoginDto) {
    return loginDto;
  }

  @Post("logout")
  logout(@Body() body: LogoutDto) {
    return body;
  }
}
`;

const LOGIN_DTO = `
export class LoginDto {
  email: string;
  password: string;
}
`;

const LOGOUT_DTO = `
export class LogoutDto {
  refreshToken: string;
}
`;

describe("nestjsScanner", () => {
  it("extracts request bodies from @Body() DTOs", async () => {
    const fs = createMemoryFs({
      "/project/package.json": "{}",
      "/project/src/auth/auth.controller.ts": AUTH_CONTROLLER,
      "/project/src/auth/dto/login.dto.ts": LOGIN_DTO,
      "/project/src/auth/dto/logout.dto.ts": LOGOUT_DTO,
    });

    const endpoints = await nestjsScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {
        dependencies: {
          "@nestjs/common": "^10.0.0",
          "@nestjs/core": "^10.0.0",
        },
      },
      options: { projectPath: "/project" },
      detectedFrameworks: ["nestjs"],
    });

    const login = endpoints.find((ep) => ep.path.endsWith("/login"));
    expect(login?.requestBody?.schema).toEqual({
      email: "",
      password: "",
    });

    const logout = endpoints.find((ep) => ep.path.endsWith("/logout"));
    expect(logout?.requestBody?.schema).toEqual({ refreshToken: "" });
  });
});
