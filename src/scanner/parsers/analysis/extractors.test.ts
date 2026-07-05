import { describe, expect, it } from "vitest";
import {
  buildPathParameters,
  extractBodyFromHandler,
  extractMiddlewareNames,
  detectAuthFromMiddleware,
  traverseAst,
  parseSource,
} from "./extractors";
import * as t from "@babel/types";

describe("buildPathParameters", () => {
  it("extracts colon-style path params", () => {
    const params = buildPathParameters("/users/:id/posts/:slug");
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("id");
    expect(params[1].name).toBe("slug");
    expect(params[0].in).toBe("path");
  });
});

describe("extractBodyFromHandler", () => {
  it("extracts fields from inline arrow handlers", () => {
    const parsed = parseSource(
      `app.post("/login", (req, res) => {
        const { email, password } = req.body;
        res.json({ email, password });
      });`,
      "routes.ts",
    )!;

    let handlerArg: t.Expression | undefined;
    traverseAst(parsed, {
      CallExpression(path) {
        const last = path.node.arguments[path.node.arguments.length - 1];
        if (t.isExpression(last) && t.isArrowFunctionExpression(last)) {
          handlerArg = last;
        }
      },
    });

    const body = extractBodyFromHandler(parsed, handlerArg!);
    expect(body?.contentType).toBe("application/json");
    expect(body?.schema).toEqual({ email: "", password: "" });
  });

  it("extracts fields from const-assigned handlers", () => {
    const parsed = parseSource(
      `const loginHandler = (req, res) => {
        const { email, password } = req.body;
        res.json({ ok: true });
      };
      app.post("/login", loginHandler);`,
      "routes.ts",
    )!;

    let handlerArg: t.Expression | undefined;
    traverseAst(parsed, {
      CallExpression(path) {
        const last = path.node.arguments[path.node.arguments.length - 1];
        if (t.isExpression(last) && t.isIdentifier(last) && last.name === "loginHandler") {
          handlerArg = last;
        }
      },
    });

    const body = extractBodyFromHandler(parsed, handlerArg!);
    expect(body?.schema).toEqual({ email: "", password: "" });
  });

  it("extracts fields from named function declarations", () => {
    const parsed = parseSource(
      `function loginHandler(req, res) {
        const { email, password } = req.body;
        res.json({ ok: true });
      }
      app.post("/login", loginHandler);`,
      "routes.ts",
    )!;

    const body = extractBodyFromHandler(parsed, t.identifier("loginHandler"));
    expect(body?.schema).toEqual({ email: "", password: "" });
  });

  it("extracts fields from controller object methods", () => {
    const parsed = parseSource(
      `const authController = {
        login: async (req, res) => {
          const { email, password } = req.body;
          res.json({ ok: true });
        },
      };
      router.post("/login", authController.login);`,
      "routes.ts",
    )!;

    let handlerArg: t.Expression | undefined;
    traverseAst(parsed, {
      CallExpression(path) {
        const last = path.node.arguments[path.node.arguments.length - 1];
        if (t.isMemberExpression(last)) handlerArg = last;
      },
    });

    const body = extractBodyFromHandler(parsed, handlerArg!);
    expect(body?.schema).toEqual({ email: "", password: "" });
  });

  it("extracts fields from req.body.member access", () => {
    const parsed = parseSource(
      `app.post("/users", (req, res) => {
        const name = req.body.name;
        const email = req.body.email;
        res.json({ name, email });
      });`,
      "routes.ts",
    )!;

    let handlerArg: t.Expression | undefined;
    traverseAst(parsed, {
      CallExpression(path) {
        const last = path.node.arguments[path.node.arguments.length - 1];
        if (t.isExpression(last) && t.isArrowFunctionExpression(last)) {
          handlerArg = last;
        }
      },
    });

    const body = extractBodyFromHandler(parsed, handlerArg!);
    expect(body?.schema).toEqual({ name: "", email: "" });
  });
});

describe("middleware extraction", () => {
  it("detects auth middleware names", () => {
    const args = [
      t.stringLiteral("/login"),
      t.identifier("authenticate"),
      t.identifier("loginHandler"),
    ];
    const middleware = extractMiddlewareNames(args, 1);
    expect(middleware[0].type).toBe("auth");
    const auth = detectAuthFromMiddleware(middleware);
    expect(auth?.required).toBe(true);
  });

  it("detects jwt as bearer auth", () => {
    const args = [t.stringLiteral("/me"), t.identifier("verifyJwt")];
    const middleware = extractMiddlewareNames(args, 1);
    const auth = detectAuthFromMiddleware(middleware);
    expect(auth?.type).toBe("bearer");
  });
});
