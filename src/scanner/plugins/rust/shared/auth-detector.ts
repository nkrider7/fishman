import type { ApiAuthentication, ApiMiddleware } from "../../../models/endpoint";

const AUTH_MIDDLEWARE_PATTERNS = [
  /\b(?:HttpAuthentication|Authentication|RequireAuth|AuthMiddleware|JwtAuth|BearerAuth)\b/,
  /\b(?:auth::|middleware::auth|require_auth|with_auth)\b/,
  /\.wrap\s*\(\s*(?:Auth|Authentication|RequireAuth)\b/,
  /\.layer\s*\(\s*(?:Auth|Authentication|RequireAuth|RequireAuthentication)\b/,
];

const AUTH_ATTRIBUTE_PATTERNS = [
  /#\[(?:actix_web::)?middleware::(?:from_fn|from|DefaultHeaders)\(.*auth/i,
  /\.wrap\s*\(\s*Authentication\b/,
];

export function detectAuthFromSource(
  source: string,
  lineStart: number,
  lineEnd: number,
): { authentication?: ApiAuthentication; middleware: ApiMiddleware[] } {
  const lines = source.split("\n");
  const slice = lines.slice(Math.max(0, lineStart - 5), lineEnd + 1).join("\n");

  const middleware: ApiMiddleware[] = [];
  let authRequired = false;

  for (const pattern of AUTH_MIDDLEWARE_PATTERNS) {
    if (pattern.test(slice)) {
      authRequired = true;
      middleware.push({ name: "Auth", type: "auth", source: slice.match(pattern)?.[0] });
    }
  }

  for (const pattern of AUTH_ATTRIBUTE_PATTERNS) {
    if (pattern.test(slice)) {
      authRequired = true;
      middleware.push({ name: "AuthMiddleware", type: "auth" });
    }
  }

  if (!authRequired) return { middleware };

  return {
    authentication: {
      type: "bearer",
      required: true,
      middleware: middleware.map((m) => m.name),
    },
    middleware,
  };
}
