/**
 * Extensible HTTP method metadata.
 * UI, validation, and networking should read from the registry — not switch on method names.
 */

export type HttpMethodName =
  | "GET"
  | "QUERY"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT";

export type MethodSemanticKind = "read" | "mutation" | "meta";

export interface MethodDefinition {
  name: HttpMethodName;
  /** RFC 9110 safe method — no intended state change */
  safe: boolean;
  /** Repeating the request has the same effect */
  idempotent: boolean;
  /** Whether a request body is allowed / expected */
  supportsBody: boolean;
  /** Whether responses may be cached under standard HTTP caching */
  cacheable: boolean;
  supportsStreaming: boolean;
  supportsMultipart: boolean;
  /** Body may carry a GraphQL document (unrelated to HTTP QUERY) */
  supportsGraphQL: boolean;
  /** Lucide icon name for UI */
  icon: "arrow-down" | "search" | "plus" | "upload" | "pencil" | "trash" | "eye" | "settings" | "route" | "link";
  /** Hex color used for method badges */
  color: string;
  /** Tailwind/CSS class suffix: method-{cssClass} */
  cssClass: string;
  description: string;
  /** Short tooltip for the method selector */
  tooltip: string;
  /** High-level semantic for badges */
  semanticKind: MethodSemanticKind;
  /** Human label for the semantic badge */
  semanticLabel: string;
  /** Longer docs shown when the method is selected */
  documentation: string;
  /** Display order in the method selector */
  order: number;
}

export type QuerySupportStatus =
  | "unknown"
  | "supported"
  | "rejected"
  | "not_advertised";

export interface QueryHostCapability {
  host: string;
  status: QuerySupportStatus;
  /** Methods listed in Allow / Accept-Query when known */
  allowedMethods: string[];
  acceptQueryMediaTypes: string[];
  updatedAt: number;
  lastStatusCode?: number;
}
