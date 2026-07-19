import { shellSingleQuote } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generateCurl(req: EffectiveRequest): string {
  const parts: string[] = ["curl"];
  const method = req.method.toUpperCase();

  if (method !== "GET") {
    parts.push(`--request ${method}`);
  }

  parts.push(shellSingleQuote(req.url || ""));

  const headers = headersWithContentType(req);
  for (const h of headers) {
    parts.push(`--header ${shellSingleQuote(`${h.key}: ${h.value}`)}`);
  }

  if (req.bodyType === "form-data" && req.formData?.length) {
    for (const field of req.formData) {
      if (field.type === "file") {
        const path = field.filePath || "";
        parts.push(`--form ${shellSingleQuote(`${field.key}=@${path}`)}`);
      } else {
        parts.push(
          `--form ${shellSingleQuote(`${field.key}=${field.value ?? ""}`)}`,
        );
      }
    }
  } else if (hasBody(req) && req.body != null) {
    parts.push(`--data-raw ${shellSingleQuote(req.body)}`);
  }

  // Multi-line with backslash continuations
  if (parts.length <= 2) {
    return parts.join(" ");
  }
  const [cmd, ...rest] = parts;
  return [cmd, ...rest.map((p, i) => (i < rest.length - 1 ? `  ${p} \\` : `  ${p}`))].join(
    "\n",
  );
}

export function generateHttpie(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const lines: string[] = [];
  const headers = headersWithContentType(req);

  let cmd = `http ${method} ${shellSingleQuote(req.url || "")}`;

  const headerArgs = headers.map(
    (h) => `${h.key}:${shellSingleQuote(h.value)}`,
  );

  if (req.bodyType === "form-data" && req.formData?.length) {
    const formArgs = req.formData.map((f) => {
      if (f.type === "file") {
        return `${f.key}@${shellSingleQuote(f.filePath || "")}`;
      }
      return `${f.key}=${shellSingleQuote(f.value ?? "")}`;
    });
    lines.push([cmd, ...headerArgs, ...formArgs].join(" \\\n  "));
    return lines.join("\n");
  }

  if (hasBody(req) && req.body != null) {
    // Prefer JSON via stdin for raw bodies
    lines.push(`${cmd} \\\n  ${headerArgs.join(" \\\n  ")} \\\n  <<< ${shellSingleQuote(req.body)}`);
    return lines.join("\n");
  }

  if (headerArgs.length) {
    return [cmd, ...headerArgs].join(" \\\n  ");
  }
  return cmd;
}

export function generateWget(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const parts: string[] = ["wget"];
  const headers = headersWithContentType(req);

  if (method !== "GET") {
    parts.push(`--method=${method}`);
  }

  for (const h of headers) {
    parts.push(`--header=${shellSingleQuote(`${h.key}: ${h.value}`)}`);
  }

  if (hasBody(req) && req.body != null && req.bodyType !== "form-data") {
    parts.push(`--body-data=${shellSingleQuote(req.body)}`);
  }

  parts.push(shellSingleQuote(req.url || ""));
  parts.push("-O -");

  if (parts.length <= 3) {
    return parts.join(" ");
  }
  const [cmd, ...rest] = parts;
  return [cmd, ...rest.map((p, i) => (i < rest.length - 1 ? `  ${p} \\` : `  ${p}`))].join(
    "\n",
  );
}
