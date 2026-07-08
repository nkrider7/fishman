import * as t from "@babel/types";
import { getStringLiteral } from "../../../parsers/analysis/extractors";

export interface ParsedUseCall {
  /** Parent receiver, e.g. "app" in app.use(...) */
  parent: string;
  /** Mount path prefix; empty when mounting without a path segment */
  mountPath: string;
  /** Mounted router/module identifier */
  routerIdent: t.Identifier;
}

function toExpressions(
  args: (t.Expression | t.SpreadElement)[],
): t.Expression[] {
  return args.filter((arg): arg is t.Expression => t.isExpression(arg));
}

/**
 * Parse Express/Fastify-style `.use()` calls.
 *
 * Supports common production patterns:
 * - app.use("/api", router)
 * - app.use("/api", middleware, router)
 * - app.use("/api", mw1, mw2(), router)
 * - router.use(subRouter)
 * - router.use("/nested", subRouter)
 */
export function parseUseCall(
  parent: string,
  args: (t.Expression | t.SpreadElement)[],
): ParsedUseCall | null {
  const expressions = toExpressions(args);
  if (expressions.length === 0) return null;

  const mountPath = getStringLiteral(expressions[0]) ?? "";

  if (mountPath) {
    // Path-first: router is the last identifier argument (after middleware)
    for (let i = expressions.length - 1; i >= 1; i--) {
      const arg = expressions[i];
      if (t.isIdentifier(arg)) {
        return { parent, mountPath, routerIdent: arg };
      }
    }
    return null;
  }

  // No path prefix — first arg is the mounted router/sub-app
  const first = expressions[0];
  if (t.isIdentifier(first)) {
    return { parent, mountPath: "", routerIdent: first };
  }

  return null;
}
