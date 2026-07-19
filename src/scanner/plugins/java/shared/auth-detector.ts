import type { ApiAuthentication, ApiMiddleware } from "../../../models/endpoint";
import type { ParsedAnnotation, ParsedControllerMethod } from "./types";
import { annotationHas } from "./annotation-extractor";

const AUTH_ANNOTATIONS = [
  "PreAuthorize",
  "Secured",
  "RolesAllowed",
  "AuthenticationPrincipal",
  "WithMockUser",
];

export function detectMethodAuth(
  methodAnnotations: ParsedAnnotation[],
  classAnnotations: ParsedAnnotation[],
): { authentication?: ApiAuthentication; middleware: ApiMiddleware[] } {
  const middleware: ApiMiddleware[] = [];
  const combined = [...classAnnotations, ...methodAnnotations];

  const authAnns = combined.filter((a) => AUTH_ANNOTATIONS.includes(a.name));
  if (authAnns.length === 0) {
    return { middleware };
  }

  for (const ann of authAnns) {
    middleware.push({
      name: ann.name,
      type: "auth",
      source: ann.raw,
    });
  }

  const authentication: ApiAuthentication = {
    type: "bearer",
    scheme: "Bearer",
    middleware: authAnns.map((a) => a.name),
    required: true,
  };

  return { authentication, middleware };
}

export function detectAuthFromSourceHints(source: string): ApiAuthentication | undefined {
  if (
    /@PreAuthorize|@Secured|@RolesAllowed|SecurityFilterChain|authorizeHttpRequests/.test(
      source,
    )
  ) {
    return {
      type: "bearer",
      scheme: "Bearer",
      middleware: ["SpringSecurity"],
      required: true,
    };
  }
  return undefined;
}

export function methodLooksSecured(method: ParsedControllerMethod): boolean {
  return annotationHas(method.annotations, ...AUTH_ANNOTATIONS);
}
