import { csharpString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateCsharpHttpClient(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  const lines: string[] = [
    "using var client = new HttpClient();",
    `using var request = new HttpRequestMessage(HttpMethod.${methodToProperty(method)}, ${csharpString(req.url || "")});`,
  ];

  for (const h of headers) {
    if (h.key.toLowerCase() === "content-type") continue;
    lines.push(
      `request.Headers.TryAddWithoutValidation(${csharpString(h.key)}, ${csharpString(h.value)});`,
    );
  }

  if (body != null) {
    const ct =
      headers.find((h) => h.key.toLowerCase() === "content-type")?.value ??
      "application/json";
    lines.push(
      `request.Content = new StringContent(${csharpString(body)}, System.Text.Encoding.UTF8, ${csharpString(ct)});`,
    );
  }

  lines.push("using var response = await client.SendAsync(request);");
  lines.push("var responseBody = await response.Content.ReadAsStringAsync();");
  lines.push("Console.WriteLine(responseBody);");
  return lines.join("\n");
}

function methodToProperty(method: string): string {
  const known = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "TRACE", "PATCH"];
  if (known.includes(method)) {
    return method.charAt(0) + method.slice(1).toLowerCase();
  }
  return `Parse("${method}")`;
}
