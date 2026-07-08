import type { ApiAuthentication } from "../../../models/endpoint";
import type { ParsedPythonModule } from "../../../parsers/ast/python-parser";
import { walkPythonAst } from "../../../parsers/ast/python-parser";
import { getAttributeChain, isNodeType } from "./ast-utils";
import type { ASTNodeUnion } from "py-ast";

export interface AuthPattern {
  type: ApiAuthentication["type"];
  scheme?: string;
  middleware?: string[];
  required: boolean;
}

export function detectAuthFromSource(source: string): AuthPattern[] {
  const patterns: AuthPattern[] = [];

  if (/OAuth2PasswordBearer|OAuth2AuthorizationCodeBearer/.test(source)) {
    patterns.push({ type: "oauth2", scheme: "Bearer", required: true });
  }
  if (/HTTPBearer|HTTPAuthorizationCredentials/.test(source)) {
    patterns.push({ type: "bearer", scheme: "Bearer", required: true });
  }
  if (/APIKeyHeader|APIKeyQuery|APIKeyCookie/.test(source)) {
    patterns.push({ type: "apikey", required: true });
  }
  if (/HTTPBasic|HTTPBasicCredentials|basic_auth/.test(source)) {
    patterns.push({ type: "basic", required: true });
  }
  if (/jwt\.decode|jwt\.encode|PyJWT|python-jose/.test(source)) {
    patterns.push({ type: "bearer", scheme: "JWT", required: true });
  }
  if (/login_required|@login_required/.test(source)) {
    patterns.push({ type: "session", required: true });
  }
  if (/permission_classes|IsAuthenticated|authentication_classes/.test(source)) {
    patterns.push({ type: "bearer", scheme: "Token", required: true });
  }
  if (/request\.user|get_current_user|get_current_active_user/.test(source)) {
    patterns.push({ type: "bearer", required: true });
  }
  if (/Authorization/.test(source) && /Header|header/.test(source)) {
    if (!patterns.some((p) => p.type === "bearer")) {
      patterns.push({ type: "bearer", required: true });
    }
  }

  return patterns;
}

export function detectAuthFromModule(mod: ParsedPythonModule): AuthPattern[] {
  return detectAuthFromSource(mod.source);
}

export function detectEndpointAuth(
  fnSource: string,
  decoratorSource: string,
  moduleAuth: AuthPattern[],
): ApiAuthentication | undefined {
  const combined = `${decoratorSource}\n${fnSource}`;

  if (/Depends\s*\(\s*get_current_user|Depends\s*\(\s*oauth2_scheme|Security\s*\(/.test(combined)) {
    return {
      type: "bearer",
      scheme: "Bearer",
      middleware: extractDependsNames(combined),
      required: true,
    };
  }

  if (/Depends\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/.test(combined)) {
    const deps = extractDependsNames(combined);
    if (deps.some((d) => /auth|token|user|oauth/i.test(d))) {
      return {
        type: "bearer",
        scheme: "Bearer",
        middleware: deps,
        required: true,
      };
    }
  }

  if (/login_required/.test(combined)) {
    return { type: "session", required: true };
  }

  if (/permission_classes\s*=\s*\[/.test(combined)) {
    const authType = /IsAuthenticated/.test(combined) ? "bearer" : "custom";
    return { type: authType, required: /IsAuthenticated/.test(combined) };
  }

  const local = detectAuthFromSource(combined);
  const pattern = local[0];
  if (!pattern) return undefined;

  return {
    type: pattern.type,
    scheme: pattern.scheme,
    middleware: pattern.middleware,
    required: pattern.required,
  };
}

function extractDependsNames(source: string): string[] {
  const names: string[] = [];
  const re = /Depends\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

export function extractModuleAuthPatterns(modules: ParsedPythonModule[]): AuthPattern[] {
  const all: AuthPattern[] = [];
  for (const mod of modules) {
    all.push(...detectAuthFromModule(mod));
  }
  const seen = new Set<string>();
  return all.filter((p) => {
    const key = `${p.type}:${p.scheme ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findSecurityDependencies(ast: ASTNodeUnion): string[] {
  const deps: string[] = [];
  walkPythonAst(ast, (node) => {
    if (!isNodeType(node, "Call")) return;
    const target = getAttributeChain(node);
    if (target?.endsWith("Depends") || target?.endsWith("Security")) {
      const args = (node as { args: ASTNodeUnion[] }).args;
      if (args[0] && isNodeType(args[0], "Name")) {
        deps.push((args[0] as { id: string }).id);
      }
    }
  });
  return deps;
}
