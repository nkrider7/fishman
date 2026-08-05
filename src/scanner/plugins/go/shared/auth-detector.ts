import type { ApiAuthentication, ApiMiddleware } from "../../../models/endpoint";

const AUTH_PATTERNS = [
  /\b(?:Auth|Authenticate|RequireAuth|JWT|Bearer|BasicAuth|Authorize)\b/,
  /\.Use\s*\(\s*(?:Auth|JWT|middleware\.Auth)/i,
];

export function detectAuthFromHandlerBody(body: string): {
  authentication?: ApiAuthentication;
  middleware: ApiMiddleware[];
} {
  const middleware: ApiMiddleware[] = [];
  let required = false;

  for (const pattern of AUTH_PATTERNS) {
    if (pattern.test(body)) {
      required = true;
      middleware.push({ name: "Auth", type: "auth" });
      break;
    }
  }

  if (!required) return { middleware };

  return {
    authentication: {
      type: "bearer",
      required: true,
      middleware: middleware.map((m) => m.name),
    },
    middleware,
  };
}
