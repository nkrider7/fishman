export type { HttpMethodName, MethodDefinition, MethodSemanticKind, QueryHostCapability, QuerySupportStatus } from "./types";
export {
  METHOD_DEFINITIONS,
  HTTP_METHOD_ORDER,
  getMethodDefinition,
  requireMethodDefinition,
  isKnownHttpMethod,
  methodSupportsBody,
  isSafeMethod,
  isIdempotentMethod,
  getMethodCssClass,
  getMethodColor,
} from "./registry";
export {
  QUERY_TEMPLATES,
  applyRequestTemplate,
  type RequestTemplate,
} from "./templates";
export {
  getMethodWarnings,
  suggestQueryMigration,
  type MethodWarning,
  type MethodWarningSeverity,
} from "./warnings";
export {
  detectQuerySupport,
  getCachedQueryCapability,
  clearQueryCapabilityCache,
  querySupportLabel,
  shouldOfferQueryFallback,
  type QueryFallbackMethod,
} from "./capability";
export {
  parseMethodSearch,
  matchesMethodSearch,
  type MethodSearchMatch,
} from "./search";
