import type { ApiRequestBody } from "../../models/endpoint";
import { fieldsToRequestBodyFromSchema } from "./extractors";

const ROUTE_BODY_TEMPLATES: Record<string, Record<string, unknown>> = {
  login: { email: "user@example.com", password: "" },
  register: { email: "user@example.com", password: "", name: "" },
  signup: { email: "user@example.com", password: "", name: "" },
  refresh: { refreshToken: "" },
  logout: { refreshToken: "" },
  forgotpassword: { email: "user@example.com" },
  "forgot-password": { email: "user@example.com" },
  resetpassword: { token: "", password: "" },
  "reset-password": { token: "", password: "" },
  google: { idToken: "" },
  sync: { deviceId: "", lastSyncAt: "" },
};

export function inferBodyFromRoutePath(routePath: string): ApiRequestBody | undefined {
  const segments = routePath.split("/").filter(Boolean);
  const last = segments[segments.length - 1]?.replace(/^:/, "") ?? "";
  const key = last.toLowerCase().replace(/_/g, "-");
  const schema = ROUTE_BODY_TEMPLATES[key];
  if (!schema) return undefined;
  return fieldsToRequestBodyFromSchema(schema);
}

export function inferBodyFromHandlerName(
  handlerName: string | null | undefined,
): ApiRequestBody | undefined {
  if (!handlerName) return undefined;
  const key = handlerName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const schema = ROUTE_BODY_TEMPLATES[key];
  if (!schema) return undefined;
  return fieldsToRequestBodyFromSchema(schema);
}
