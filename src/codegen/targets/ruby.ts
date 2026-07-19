import { rubyString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateRubyNetHttp(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  let useHttps = false;
  try {
    const u = new URL(req.url || "http://localhost/");
    useHttps = u.protocol === "https:";
  } catch {
    /* ignore */
  }

  const className = methodClass(method);
  const lines: string[] = [
    "require 'net/http'",
    "require 'uri'",
    "",
    `uri = URI(${rubyString(req.url || "")})`,
    "http = Net::HTTP.new(uri.host, uri.port)",
  ];
  if (useHttps) {
    lines.push("http.use_ssl = true");
  }
  lines.push(`request = Net::HTTP::${className}.new(uri)`);

  for (const h of headers) {
    lines.push(
      `request[${rubyString(h.key)}] = ${rubyString(h.value)}`,
    );
  }
  if (body != null) {
    lines.push(`request.body = ${rubyString(body)}`);
  }
  lines.push("response = http.request(request)");
  lines.push("puts response.body");
  return lines.join("\n");
}

function methodClass(method: string): string {
  const map: Record<string, string> = {
    GET: "Get",
    POST: "Post",
    PUT: "Put",
    PATCH: "Patch",
    DELETE: "Delete",
    HEAD: "Head",
    OPTIONS: "Options",
  };
  return map[method] ?? "Get";
}
