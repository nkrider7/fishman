import { goString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateGoNetHttp(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  const imports = [
    '  "fmt"',
    '  "io"',
    '  "net/http"',
    ...(body != null ? ['  "strings"'] : []),
  ];

  const lines: string[] = [
    "package main",
    "",
    "import (",
    ...imports,
    ")",
    "",
    "func main() {",
  ];

  if (body != null) {
    lines.push(`  payload := strings.NewReader(${goString(body)})`);
    lines.push(
      `  req, err := http.NewRequest(${goString(method)}, ${goString(req.url || "")}, payload)`,
    );
  } else {
    lines.push(
      `  req, err := http.NewRequest(${goString(method)}, ${goString(req.url || "")}, nil)`,
    );
  }
  lines.push("  if err != nil {");
  lines.push("    panic(err)");
  lines.push("  }");

  for (const h of headers) {
    lines.push(
      `  req.Header.Set(${goString(h.key)}, ${goString(h.value)})`,
    );
  }

  lines.push("  res, err := http.DefaultClient.Do(req)");
  lines.push("  if err != nil {");
  lines.push("    panic(err)");
  lines.push("  }");
  lines.push("  defer res.Body.Close()");
  lines.push("  body, _ := io.ReadAll(res.Body)");
  lines.push('  fmt.Println(string(body))');
  lines.push("}");
  return lines.join("\n");
}
