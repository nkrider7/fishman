import { javaString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateJavaOkHttp(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;
  const ct =
    headers.find((h) => h.key.toLowerCase() === "content-type")?.value ??
    "application/json";

  const lines: string[] = [
    "OkHttpClient client = new OkHttpClient();",
    "",
  ];

  if (body != null) {
    lines.push(
      `MediaType mediaType = MediaType.parse(${javaString(ct)});`,
    );
    lines.push(
      `RequestBody body = RequestBody.create(${javaString(body)}, mediaType);`,
    );
  }

  lines.push("Request request = new Request.Builder()");
  lines.push(`  .url(${javaString(req.url || "")})`);

  if (body != null) {
    if (method === "POST") {
      lines.push("  .post(body)");
    } else if (method === "PUT") {
      lines.push("  .put(body)");
    } else if (method === "PATCH") {
      lines.push("  .patch(body)");
    } else if (method === "DELETE") {
      lines.push("  .delete(body)");
    } else {
      lines.push(`  .method(${javaString(method)}, body)`);
    }
  } else if (method !== "GET") {
    lines.push(`  .method(${javaString(method)}, null)`);
  }

  for (const h of headers) {
    if (h.key.toLowerCase() === "content-type" && body != null) continue;
    lines.push(`  .addHeader(${javaString(h.key)}, ${javaString(h.value)})`);
  }

  lines.push("  .build();");
  lines.push("");
  lines.push("try (Response response = client.newCall(request).execute()) {");
  lines.push("  System.out.println(response.body().string());");
  lines.push("}");
  return lines.join("\n");
}
