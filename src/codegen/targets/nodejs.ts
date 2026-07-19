import { jsString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";
import { generateJsAxios, generateJsFetch } from "./javascript";

export function generateNodeFetch(req: EffectiveRequest): string {
  return generateJsFetch(req);
}

export function generateNodeAxios(req: EffectiveRequest): string {
  return generateJsAxios(req);
}

export function generateNodeNativeHttp(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(req.url || "http://localhost");
  } catch {
    /* keep null */
  }

  const isHttps = urlObj?.protocol === "https:";
  const hostname = urlObj?.hostname ?? "localhost";
  const path = urlObj
    ? `${urlObj.pathname}${urlObj.search}`
    : req.url || "/";
  const port = urlObj?.port
    ? Number(urlObj.port)
    : isHttps
      ? 443
      : 80;

  const headerLines = headers
    .map((h) => `    ${jsString(h.key)}: ${jsString(h.value)}`)
    .join(",\n");

  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  const lines = [
    `const http = require(${jsString(isHttps ? "https" : "http")});`,
    "",
    "const options = {",
    `  hostname: ${jsString(hostname)},`,
    `  port: ${port},`,
    `  path: ${jsString(path)},`,
    `  method: ${jsString(method)},`,
    headers.length
      ? `  headers: {\n${headerLines}\n  }`
      : "  headers: {}",
    "};",
    "",
    "const req = http.request(options, (res) => {",
    "  let data = '';",
    "  res.on('data', (chunk) => { data += chunk; });",
    "  res.on('end', () => { console.log(data); });",
    "});",
    "",
    "req.on('error', (error) => {",
    "  console.error(error);",
    "});",
    "",
  ];

  if (body != null) {
    lines.push(`req.write(${jsString(body)});`);
  }
  lines.push("req.end();");
  return lines.join("\n");
}
