import type { HttpMethodName, MethodDefinition } from "./types";

/**
 * Canonical HTTP method registry.
 * Add a new method here — UI and helpers pick it up automatically.
 */
export const METHOD_DEFINITIONS: Record<HttpMethodName, MethodDefinition> = {
  GET: {
    name: "GET",
    safe: true,
    idempotent: true,
    supportsBody: false,
    cacheable: true,
    supportsStreaming: true,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "arrow-down",
    color: "#22c55e",
    cssClass: "get",
    description: "Retrieve a resource representation.",
    tooltip: "Safe, idempotent retrieval. Prefer QUERY when a request body is needed.",
    semanticKind: "read",
    semanticLabel: "Read Operation",
    documentation:
      "GET retrieves a representation of the target resource. It is safe and idempotent. Request bodies on GET are undefined by the HTTP specification and often ignored by intermediaries.",
    order: 10,
  },
  QUERY: {
    name: "QUERY",
    safe: true,
    idempotent: true,
    supportsBody: true,
    cacheable: true,
    supportsStreaming: true,
    supportsMultipart: true,
    supportsGraphQL: true,
    icon: "search",
    color: "#06b6d4",
    cssClass: "query",
    description:
      "Safe, idempotent query with a request body (RFC 10008).",
    tooltip: "Safe request with request body.",
    semanticKind: "read",
    semanticLabel: "Read Operation",
    documentation:
      "QUERY is an HTTP method defined in RFC 10008. It is intended for safe and idempotent queries while allowing a request body.\n\nUse QUERY instead of POST when retrieving data that requires complex request payloads. Unlike GET, QUERY supports a body. Unlike POST, QUERY must never be treated as a mutation — the server promises no state change.\n\nNote: HTTP QUERY is unrelated to GraphQL queries; GraphQL remains a body content type that typically uses POST (or QUERY when the server supports it).",
    order: 20,
  },
  POST: {
    name: "POST",
    safe: false,
    idempotent: false,
    supportsBody: true,
    cacheable: false,
    supportsStreaming: true,
    supportsMultipart: true,
    supportsGraphQL: true,
    icon: "plus",
    color: "#f59e0b",
    cssClass: "post",
    description: "Submit data for processing; may create or mutate state.",
    tooltip: "Non-idempotent mutation. Prefer QUERY for read-only payloads.",
    semanticKind: "mutation",
    semanticLabel: "Mutation",
    documentation:
      "POST submits data to the target resource. It is neither safe nor idempotent and may create or modify server state. Prefer QUERY when the intent is only to retrieve data with a complex payload.",
    order: 30,
  },
  PUT: {
    name: "PUT",
    safe: false,
    idempotent: true,
    supportsBody: true,
    cacheable: false,
    supportsStreaming: true,
    supportsMultipart: true,
    supportsGraphQL: false,
    icon: "upload",
    color: "#3b82f6",
    cssClass: "put",
    description: "Replace the target resource.",
    tooltip: "Idempotent full replacement of a resource.",
    semanticKind: "mutation",
    semanticLabel: "Mutation",
    documentation:
      "PUT replaces the state of the target resource with the request payload. It is idempotent but not safe.",
    order: 40,
  },
  PATCH: {
    name: "PATCH",
    safe: false,
    idempotent: false,
    supportsBody: true,
    cacheable: false,
    supportsStreaming: true,
    supportsMultipart: true,
    supportsGraphQL: false,
    icon: "pencil",
    color: "#a855f7",
    cssClass: "patch",
    description: "Apply a partial modification to the target resource.",
    tooltip: "Partial update; not necessarily idempotent.",
    semanticKind: "mutation",
    semanticLabel: "Mutation",
    documentation:
      "PATCH applies partial modifications to the target resource. Semantics depend on the media type of the patch document.",
    order: 50,
  },
  DELETE: {
    name: "DELETE",
    safe: false,
    idempotent: true,
    supportsBody: true,
    cacheable: false,
    supportsStreaming: false,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "trash",
    color: "#ef4444",
    cssClass: "delete",
    description: "Remove the target resource.",
    tooltip: "Idempotent deletion of a resource.",
    semanticKind: "mutation",
    semanticLabel: "Mutation",
    documentation:
      "DELETE removes the target resource. It is idempotent but not safe. A body is allowed but uncommon.",
    order: 60,
  },
  HEAD: {
    name: "HEAD",
    safe: true,
    idempotent: true,
    supportsBody: false,
    cacheable: true,
    supportsStreaming: false,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "eye",
    color: "#ec4899",
    cssClass: "head",
    description: "Same as GET but returns headers only.",
    tooltip: "Safe metadata retrieval without a response body.",
    semanticKind: "read",
    semanticLabel: "Read Operation",
    documentation:
      "HEAD is identical to GET except the server must not send a response body. Useful for checking headers, existence, or content length.",
    order: 70,
  },
  OPTIONS: {
    name: "OPTIONS",
    safe: true,
    idempotent: true,
    supportsBody: false,
    cacheable: false,
    supportsStreaming: false,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "settings",
    color: "#64748b",
    cssClass: "options",
    description: "Describe communication options for the target resource.",
    tooltip: "Discover allowed methods and CORS preflight details.",
    semanticKind: "meta",
    semanticLabel: "Meta",
    documentation:
      "OPTIONS describes the communication options available for the target resource. Responses often include an Allow header listing supported methods.",
    order: 80,
  },
  TRACE: {
    name: "TRACE",
    safe: true,
    idempotent: true,
    supportsBody: false,
    cacheable: false,
    supportsStreaming: false,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "route",
    color: "#94a3b8",
    cssClass: "trace",
    description: "Echo the received request for diagnostics.",
    tooltip: "Diagnostic loop-back; often disabled on production servers.",
    semanticKind: "meta",
    semanticLabel: "Meta",
    documentation:
      "TRACE performs a message loop-back test along the path to the target resource. Many servers disable TRACE for security reasons.",
    order: 90,
  },
  CONNECT: {
    name: "CONNECT",
    safe: false,
    idempotent: false,
    supportsBody: false,
    cacheable: false,
    supportsStreaming: true,
    supportsMultipart: false,
    supportsGraphQL: false,
    icon: "link",
    color: "#78716c",
    cssClass: "connect",
    description: "Establish a tunnel to the server identified by the target.",
    tooltip: "Used by proxies to establish a tunnel (e.g. HTTPS).",
    semanticKind: "meta",
    semanticLabel: "Meta",
    documentation:
      "CONNECT establishes a tunnel to the server identified by the target resource. It is primarily used by HTTP proxies.",
    order: 100,
  },
};

/** Methods shown in the request builder selector, in display order. */
export const HTTP_METHOD_ORDER: HttpMethodName[] = (
  Object.values(METHOD_DEFINITIONS) as MethodDefinition[]
)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.name);

export function getMethodDefinition(
  method: string,
): MethodDefinition | undefined {
  const key = method.toUpperCase() as HttpMethodName;
  return METHOD_DEFINITIONS[key];
}

export function requireMethodDefinition(method: string): MethodDefinition {
  const def = getMethodDefinition(method);
  if (!def) {
    throw new Error(`Unknown HTTP method: ${method}`);
  }
  return def;
}

export function isKnownHttpMethod(method: string): method is HttpMethodName {
  return method.toUpperCase() in METHOD_DEFINITIONS;
}

export function methodSupportsBody(method: string): boolean {
  return getMethodDefinition(method)?.supportsBody ?? true;
}

export function isSafeMethod(method: string): boolean {
  return getMethodDefinition(method)?.safe ?? false;
}

export function isIdempotentMethod(method: string): boolean {
  return getMethodDefinition(method)?.idempotent ?? false;
}

export function getMethodCssClass(method: string): string {
  const def = getMethodDefinition(method);
  return def ? `method-${def.cssClass}` : `method-${method.toLowerCase()}`;
}

export function getMethodColor(method: string): string {
  return getMethodDefinition(method)?.color ?? "#94a3b8";
}
