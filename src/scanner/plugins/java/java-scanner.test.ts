import { describe, expect, it } from "vitest";
import type { FileSystemAdapter, FsDirEntry } from "../../core/types";
import { scanProject } from "../../core/scanner";
import { createRegistry } from "../../core/registry";
import { javaLanguagePlugin } from "../../language/java-plugin";
import { springBootScanner } from "./spring-boot/spring-boot-scanner";
import {
  detectJavaProject,
  hasSpringDependency,
  parseGradleDependencies,
  parsePomDependencies,
  parsePropertiesConfig,
  parseYamlConfig,
} from "./shared/project-detector";
import {
  joinPaths,
  simplifySpringPath,
  extractPathParamsFromPattern,
  applyGlobalPrefix,
} from "./shared/path-utils";
import {
  parseAnnotationArgs,
  parseJavaControllers,
  getAnnotationPaths,
  getHttpMethodsFromAnnotation,
} from "./shared/annotation-extractor";
import { extractSchemasFromSource } from "./shared/dto-schema-extractor";

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
      while (
        i < fromParts.length &&
        i < toParts.length &&
        fromParts[i] === toParts[i]
      ) {
        i++;
      }
      return [
        ...Array(fromParts.length - i).fill(".."),
        ...toParts.slice(i),
      ].join("/");
    },
  };
}

const POM = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
  </dependencies>
</project>
`;

const SPRING_BOOT_PROJECT: Record<string, string> = {
  "/project/pom.xml": POM,
  "/project/src/main/resources/application.yml": `
server:
  servlet:
    context-path: /api
`,
  "/project/src/main/java/com/example/DemoApplication.java": `
package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
`,
  "/project/src/main/java/com/example/user/CreateUserRequest.java": `
package com.example.user;

public record CreateUserRequest(String name, String email, Integer age) {}
`,
  "/project/src/main/java/com/example/user/UserController.java": `
package com.example.user;

import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/users")
public class UserController {

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) String q) {
        return ResponseEntity.ok(null);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id) {
        return ResponseEntity.ok(null);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateUserRequest body) {
        return ResponseEntity.ok(null);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable("id") Long id) {
        return ResponseEntity.noContent().build();
    }
}
`,
  "/project/src/main/java/com/example/auth/AuthController.java": `
package com.example.auth;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @PostMapping("/login")
    public String login(@RequestBody LoginRequest body) {
        return "ok";
    }

    @GetMapping("/me")
    public String me(@RequestHeader("Authorization") String authorization) {
        return "me";
    }
}

class LoginRequest {
    private String email;
    private String password;
}
`,
  "/project/src/main/java/com/example/broken/BrokenController.java": `
package com.example.broken;

@RestController
public class BrokenController {
    @GetMapping("/broken"
    public String broken(
}
`,
};

const GRADLE_PROJECT: Record<string, string> = {
  "/project/build.gradle": `
plugins {
    id 'org.springframework.boot' version '3.1.5'
    id 'java'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
}
`,
  "/project/src/main/java/com/example/HealthController.java": `
package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    @GetMapping("/health")
    public String health() {
        return "ok";
    }
}
`,
};

const PLAIN_JAVA_LIBRARY: Record<string, string> = {
  "/project/pom.xml": `
<project>
  <dependencies>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>32.0.0</version>
    </dependency>
  </dependencies>
</project>
`,
  "/project/src/main/java/com/example/Util.java": `
package com.example;
public class Util {
    public static int add(int a, int b) { return a + b; }
}
`,
};

describe("Java project detection", () => {
  it("detects Spring Boot from Maven pom.xml", async () => {
    const fs = createMemoryFs({ "/project/pom.xml": POM });
    const project = await detectJavaProject(fs, "/project");
    expect(project.buildSystem).toBe("maven");
    expect(hasSpringDependency(project.dependencies)).toBe(true);
    expect(project.springBootVersion).toBe("3.2.0");
  });

  it("detects Spring Boot from Gradle build.gradle", async () => {
    const fs = createMemoryFs(GRADLE_PROJECT);
    const project = await detectJavaProject(fs, "/project");
    expect(project.buildSystem).toBe("gradle");
    expect(hasSpringDependency(project.dependencies)).toBe(true);
  });

  it("does not treat plain Java library as Spring", async () => {
    const fs = createMemoryFs(PLAIN_JAVA_LIBRARY);
    const project = await detectJavaProject(fs, "/project");
    expect(hasSpringDependency(project.dependencies)).toBe(false);
    expect(await springBootScanner.detect({ projectPath: "/project", fs })).toBe(
      false,
    );
  });

  it("parses context-path from application.yml", async () => {
    const fs = createMemoryFs(SPRING_BOOT_PROJECT);
    const project = await detectJavaProject(fs, "/project");
    expect(project.contextPath).toBe("/api");
  });
});

describe("path and annotation helpers", () => {
  it("joins and normalizes Spring paths", () => {
    expect(joinPaths("/api/v1", "/users", "{id}")).toBe("/api/v1/users/{id}");
    expect(joinPaths("users", "")).toBe("/users");
    expect(simplifySpringPath("/users/{id:\\d+}")).toEqual({
      path: "/users/{id}",
      warnings: expect.arrayContaining([expect.stringContaining("id")]),
    });
    expect(extractPathParamsFromPattern("/users/{id}/posts/{postId}")).toHaveLength(
      2,
    );
    expect(applyGlobalPrefix("/users", "/api", undefined)).toBe("/api/users");
  });

  it("parses annotation arguments", () => {
    expect(parseAnnotationArgs('"/users"')).toEqual({ value: "/users" });
    expect(parseAnnotationArgs('path = "/users", method = RequestMethod.POST')).toEqual(
      {
        path: "/users",
        method: "POST",
      },
    );
    expect(parseAnnotationArgs('{"/a", "/b"}')).toEqual({ value: ["/a", "/b"] });

    const ann = {
      name: "GetMapping",
      args: parseAnnotationArgs('"/x"'),
      raw: '@GetMapping("/x")',
      startIndex: 0,
    };
    expect(getAnnotationPaths(ann)).toEqual(["/x"]);
    expect(getHttpMethodsFromAnnotation(ann)).toEqual(["GET"]);
  });

  it("parses RestController methods", () => {
    const source = SPRING_BOOT_PROJECT[
      "/project/src/main/java/com/example/user/UserController.java"
    ];
    const controllers = parseJavaControllers(source, "UserController.java");
    expect(controllers).toHaveLength(1);
    expect(controllers[0].name).toBe("UserController");
    expect(controllers[0].methods.length).toBeGreaterThanOrEqual(4);
  });

  it("extracts record DTO fields", () => {
    const source =
      SPRING_BOOT_PROJECT[
        "/project/src/main/java/com/example/user/CreateUserRequest.java"
      ];
    const schemas = extractSchemasFromSource(source, "CreateUserRequest.java");
    const record = schemas.find((s) => s.name.endsWith("CreateUserRequest"));
    expect(record).toBeDefined();
    expect(record!.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["name", "email", "age"]),
    );
  });
});

describe("pom/gradle parsers", () => {
  it("parses pom dependencies and parent", () => {
    const deps = parsePomDependencies(POM);
    expect(deps["spring-boot-starter-web"]).toBeDefined();
    expect(deps["spring-boot-starter-parent"]).toBe("3.2.0");
  });

  it("parses gradle dependencies", () => {
    const deps = parseGradleDependencies(GRADLE_PROJECT["/project/build.gradle"]);
    expect(deps["spring-boot-starter-web"]).toBeDefined();
    expect(deps["spring-boot"]).toBe("3.1.5");
  });

  it("parses properties and yaml config keys", () => {
    expect(
      parsePropertiesConfig("server.servlet.context-path=/api\nspring.mvc.servlet.path=/v1\n"),
    ).toEqual({ contextPath: "/api", servletPath: "/v1" });
    expect(
      parseYamlConfig("server:\n  servlet:\n    context-path: /api\n"),
    ).toEqual({ contextPath: "/api", servletPath: undefined });
  });
});

describe("Spring Boot scanner", () => {
  it("extracts endpoints with params, body, auth, and context-path", async () => {
    const fs = createMemoryFs(SPRING_BOOT_PROJECT);
    const endpoints = await springBootScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["spring-boot"],
    });

    expect(endpoints.length).toBeGreaterThan(0);

    const paths = endpoints.map((ep) => `${ep.method} ${ep.path}`);
    expect(paths.some((p) => p === "GET /api/users")).toBe(true);
    expect(paths.some((p) => p === "GET /api/users/{id}")).toBe(true);
    expect(paths.some((p) => p === "POST /api/users")).toBe(true);
    expect(paths.some((p) => p === "DELETE /api/users/{id}")).toBe(true);
    expect(paths.some((p) => p === "POST /api/auth/login")).toBe(true);

    const getById = endpoints.find((ep) => ep.method === "GET" && ep.path === "/api/users/{id}");
    expect(getById?.pathParameters.some((p) => p.name === "id")).toBe(true);

    const list = endpoints.find((ep) => ep.method === "GET" && ep.path === "/api/users");
    expect(list?.queryParameters.some((p) => p.name === "q")).toBe(true);

    const create = endpoints.find((ep) => ep.method === "POST" && ep.path === "/api/users");
    expect(create?.requestBody?.contentType).toBe("application/json");
    expect(create?.requestBody?.schema).toMatchObject({
      name: expect.anything(),
      email: expect.anything(),
    });

    const del = endpoints.find((ep) => ep.method === "DELETE" && ep.path === "/api/users/{id}");
    expect(del?.authentication?.required).toBe(true);
    expect(del?.middleware.some((m) => m.name === "PreAuthorize")).toBe(true);

    const me = endpoints.find((ep) => ep.path === "/api/auth/me");
    expect(me?.headers.some((h) => h.name === "Authorization")).toBe(true);
  });

  it("does not crash on broken Java files", async () => {
    const fs = createMemoryFs(SPRING_BOOT_PROJECT);
    const endpoints = await springBootScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["spring-boot"],
    });
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it("dedupes identical method+path pairs", async () => {
    const fs = createMemoryFs({
      "/project/pom.xml": POM,
      "/project/src/main/java/A.java": `
@RestController
public class A {
  @GetMapping("/dup")
  public String a() { return "a"; }
}
`,
      "/project/src/main/java/B.java": `
@RestController
public class B {
  @GetMapping("/dup")
  public String b() { return "b"; }
}
`,
    });
    const endpoints = await springBootScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["spring-boot"],
    });
    const dups = endpoints.filter((ep) => ep.path === "/dup" && ep.method === "GET");
    expect(dups).toHaveLength(1);
  });
});

describe("Spring MVC @Controller + @ModelAttribute bodies", () => {
  const MVC_PROJECT: Record<string, string> = {
    "/project/pom.xml": POM,
    "/project/src/main/java/com/business/entities/User.java": `
package com.business.entities;
import java.util.List;
import jakarta.persistence.*;

@Entity
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private int u_id;
  private String uname;
  private String uemail;
  private String upassword;
  private Long unumber;
  @OneToMany(mappedBy = "user")
  private List<Orders> orders;
}
`,
    "/project/src/main/java/com/business/controllers/UserController.java": `
package com.business.controllers;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import com.business.entities.User;

@Controller
public class UserController {
  @PostMapping("/addingUser")
  public String addUser(@ModelAttribute User user) {
    return "redirect:/admin/services";
  }

  @GetMapping("/updatingUser/{id}")
  public String updateUser(@ModelAttribute User user, @PathVariable("id") int id) {
    return "redirect:/admin/services";
  }

  @GetMapping("/deleteUser/{id}")
  public String deleteUser(@PathVariable("id") int id) {
    return "redirect:/admin/services";
  }
}
`,
  };

  it("extracts form body fields from @ModelAttribute entity on POST", async () => {
    const fs = createMemoryFs(MVC_PROJECT);
    const endpoints = await springBootScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["spring-boot"],
    });

    const addUser = endpoints.find(
      (ep) => ep.method === "POST" && ep.path === "/addingUser",
    );
    expect(addUser).toBeDefined();
    expect(addUser?.requestBody?.contentType).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(addUser?.requestBody?.schema).toMatchObject({
      uname: "",
      uemail: "",
      upassword: "",
      unumber: 0,
    });
    expect(addUser?.requestBody?.schema).not.toHaveProperty("orders");
    expect(addUser?.requestBody?.example).toContain("uname=");
  });

  it("keeps update/delete methods as declared (GET in this MVC app)", async () => {
    const fs = createMemoryFs(MVC_PROJECT);
    const endpoints = await springBootScanner.scan({
      projectPath: "/project",
      fs,
      packageJson: {},
      options: { projectPath: "/project" },
      detectedFrameworks: ["spring-boot"],
    });

    const update = endpoints.find((ep) => ep.path === "/updatingUser/{id}");
    const del = endpoints.find((ep) => ep.path === "/deleteUser/{id}");
    expect(update?.method).toBe("GET");
    expect(del?.method).toBe("GET");
    expect(update?.pathParameters.some((p) => p.name === "id")).toBe(true);
  });
});

describe("scanProject integration (Java)", () => {
  it("detects Java language and scans Spring Boot project", async () => {
    const fs = createMemoryFs(SPRING_BOOT_PROJECT);
    const registry = createRegistry();
    registry.registerLanguage(javaLanguagePlugin);

    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("java");
    expect(result.frameworks).toContain("spring-boot");
    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints.some((ep) => ep.path.startsWith("/api/"))).toBe(true);
  });

  it("scans Gradle Spring Boot project end-to-end", async () => {
    const fs = createMemoryFs(GRADLE_PROJECT);
    const registry = createRegistry();
    registry.registerLanguage(javaLanguagePlugin);

    const result = await scanProject(fs, { projectPath: "/project" }, registry);
    expect(result.language).toBe("java");
    expect(result.frameworks).toContain("spring-boot");
    expect(result.endpoints.some((ep) => ep.path === "/health")).toBe(true);
  });
});
