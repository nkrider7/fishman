import { phpString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generatePhpCurl(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  const headerArray = headers
    .map((h) => `  ${phpString(`${h.key}: ${h.value}`)}`)
    .join(",\n");

  const lines: string[] = [
    "$curl = curl_init();",
    "",
    "curl_setopt_array($curl, [",
    `  CURLOPT_URL => ${phpString(req.url || "")},`,
    "  CURLOPT_RETURNTRANSFER => true,",
    `  CURLOPT_CUSTOMREQUEST => ${phpString(method)},`,
  ];

  if (headers.length) {
    lines.push(`  CURLOPT_HTTPHEADER => [\n${headerArray}\n  ],`);
  }
  if (body != null) {
    lines.push(`  CURLOPT_POSTFIELDS => ${phpString(body)},`);
  }

  lines.push("]);");
  lines.push("");
  lines.push("$response = curl_exec($curl);");
  lines.push("curl_close($curl);");
  lines.push("echo $response;");
  return lines.join("\n");
}
