import { pythonString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

export function generatePythonRequests(req: EffectiveRequest): string {
  const method = req.method.toLowerCase();
  const headers = headersWithContentType(req);
  const lines: string[] = ["import requests", ""];

  const kwargs: string[] = [`${pythonString(req.url || "")}`];

  if (headers.length) {
    const entries = headers
      .map((h) => `    ${pythonString(h.key)}: ${pythonString(h.value)}`)
      .join(",\n");
    lines.push(`headers = {\n${entries}\n}`);
    kwargs.push("headers=headers");
  }

  if (req.bodyType === "form-data" && req.formData?.length) {
    const formEntries = req.formData
      .filter((f) => f.type === "text")
      .map((f) => `    ${pythonString(f.key)}: ${pythonString(f.value ?? "")}`)
      .join(",\n");
    const files = req.formData.filter((f) => f.type === "file");
    if (formEntries) {
      lines.push(`data = {\n${formEntries}\n}`);
      kwargs.push("data=data");
    }
    if (files.length) {
      const fileEntries = files
        .map(
          (f) =>
            `    ${pythonString(f.key)}: open(${pythonString(f.filePath || "")}, 'rb')`,
        )
        .join(",\n");
      lines.push(`files = {\n${fileEntries}\n}`);
      kwargs.push("files=files");
    }
  } else if (hasBody(req) && req.body != null) {
    if (req.bodyType === "json" || req.bodyType === "graphql") {
      try {
        JSON.parse(req.body);
        lines.push(`payload = ${req.body}`);
        kwargs.push("json=payload");
      } catch {
        lines.push(`data = ${pythonString(req.body)}`);
        kwargs.push("data=data");
      }
    } else {
      lines.push(`data = ${pythonString(req.body)}`);
      kwargs.push("data=data");
    }
  }

  lines.push("");
  if (kwargs.length === 1) {
    lines.push(`response = requests.${method}(${kwargs[0]})`);
  } else {
    lines.push(
      `response = requests.${method}(\n  ${kwargs.join(",\n  ")}\n)`,
    );
  }
  lines.push("print(response.text)");
  return lines.join("\n");
}

export function generatePythonHttpClient(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  let hostname = "localhost";
  let path = "/";
  let useHttps = false;
  try {
    const u = new URL(req.url || "http://localhost/");
    hostname = u.hostname;
    path = `${u.pathname}${u.search}`;
    useHttps = u.protocol === "https:";
  } catch {
    path = req.url || "/";
  }

  const lines: string[] = ["import http.client", ""];
  if (useHttps) {
    lines.push(
      `conn = http.client.HTTPSConnection(${pythonString(hostname)})`,
    );
  } else {
    lines.push(
      `conn = http.client.HTTPConnection(${pythonString(hostname)})`,
    );
  }
  lines.push("");

  if (headers.length) {
    const entries = headers
      .map((h) => `    ${pythonString(h.key)}: ${pythonString(h.value)}`)
      .join(",\n");
    lines.push(`headers = {\n${entries}\n}`);
  } else {
    lines.push("headers = {}");
  }

  const body =
    hasBody(req) && req.body != null && req.bodyType !== "form-data"
      ? req.body
      : null;

  if (body != null) {
    lines.push(`body = ${pythonString(body)}`);
    lines.push(
      `conn.request(${pythonString(method)}, ${pythonString(path)}, body, headers)`,
    );
  } else {
    lines.push(
      `conn.request(${pythonString(method)}, ${pythonString(path)}, headers=headers)`,
    );
  }
  lines.push("res = conn.getresponse()");
  lines.push("print(res.read().decode())");
  return lines.join("\n");
}
