import { rustString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateRustReqwest(req: EffectiveRequest): string {
  const method = req.method.toLowerCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  const lines: string[] = [
    "use reqwest;",
    "",
    "#[tokio::main]",
    "async fn main() -> Result<(), Box<dyn std::error::Error>> {",
    "  let client = reqwest::Client::new();",
    `  let mut request = client.${methodSafe(method)}(${rustString(req.url || "")});`,
  ];

  for (const h of headers) {
    lines.push(
      `  request = request.header(${rustString(h.key)}, ${rustString(h.value)});`,
    );
  }
  if (body != null) {
    lines.push(`  request = request.body(${rustString(body)});`);
  }
  lines.push("  let response = request.send().await?;");
  lines.push("  println!(\"{}\", response.text().await?);");
  lines.push("  Ok(())");
  lines.push("}");
  return lines.join("\n");
}

function methodSafe(method: string): string {
  const known = ["get", "post", "put", "delete", "patch", "head"];
  return known.includes(method) ? method : "request";
}
