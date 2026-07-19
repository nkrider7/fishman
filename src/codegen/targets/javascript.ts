import { jsString } from "../escape";
import {
  hasBody,
  headersWithContentType,
} from "../effective-request";
import type { EffectiveRequest } from "../types";

function headersObjectLiteral(req: EffectiveRequest): string {
  const headers = headersWithContentType(req);
  if (!headers.length) return "{}";
  const entries = headers.map(
    (h) => `    ${jsString(h.key)}: ${jsString(h.value)}`,
  );
  return `{\n${entries.join(",\n")}\n  }`;
}

function bodyExpression(req: EffectiveRequest): string | null {
  if (!hasBody(req)) return null;
  if (req.bodyType === "form-data") {
    // Represent as FormData construction
    return null;
  }
  if (req.bodyType === "json" || req.bodyType === "graphql") {
    try {
      JSON.parse(req.body ?? "");
      return req.body ?? "null";
    } catch {
      return jsString(req.body ?? "");
    }
  }
  return jsString(req.body ?? "");
}

function formDataBlock(req: EffectiveRequest): string {
  const lines = ["const formData = new FormData();"];
  for (const f of req.formData ?? []) {
    if (f.type === "file") {
      lines.push(
        `formData.append(${jsString(f.key)}, /* file: ${f.filePath || "path"} */);`,
      );
    } else {
      lines.push(
        `formData.append(${jsString(f.key)}, ${jsString(f.value ?? "")});`,
      );
    }
  }
  return lines.join("\n");
}

export function generateJsFetch(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const isForm = req.bodyType === "form-data" && Boolean(req.formData?.length);
  const bodyExpr = bodyExpression(req);

  const lines: string[] = [];
  if (isForm) {
    lines.push(formDataBlock(req), "");
  }

  const opts: string[] = [`method: ${jsString(method)}`];
  if (headers.length && !isForm) {
    opts.push(`headers: ${headersObjectLiteral(req)}`);
  } else if (headers.length && isForm) {
    // Omit content-type for FormData
    const filtered = headers.filter(
      (h) => h.key.toLowerCase() !== "content-type",
    );
    if (filtered.length) {
      const entries = filtered.map(
        (h) => `    ${jsString(h.key)}: ${jsString(h.value)}`,
      );
      opts.push(`headers: {\n${entries.join(",\n")}\n  }`);
    }
  }

  if (isForm) {
    opts.push("body: formData");
  } else if (bodyExpr != null) {
    if (req.bodyType === "json" || req.bodyType === "graphql") {
      try {
        JSON.parse(req.body ?? "");
        opts.push(`body: JSON.stringify(${bodyExpr})`);
      } catch {
        opts.push(`body: ${bodyExpr}`);
      }
    } else {
      opts.push(`body: ${bodyExpr}`);
    }
  }

  lines.push(`const response = await fetch(${jsString(req.url || "")}, {`);
  lines.push(`  ${opts.join(",\n  ")}`);
  lines.push("});");
  lines.push("");
  lines.push("const data = await response.json();");
  lines.push("console.log(data);");
  return lines.join("\n");
}

export function generateJsAxios(req: EffectiveRequest): string {
  const method = req.method.toLowerCase();
  const headers = headersWithContentType(req);
  const isForm = req.bodyType === "form-data" && Boolean(req.formData?.length);
  const bodyExpr = bodyExpression(req);

  const lines: string[] = ["import axios from 'axios';", ""];
  if (isForm) {
    lines.push(formDataBlock(req), "");
  }

  const configParts: string[] = [
    `method: ${jsString(method)}`,
    `url: ${jsString(req.url || "")}`,
  ];

  if (headers.length) {
    const filtered = isForm
      ? headers.filter((h) => h.key.toLowerCase() !== "content-type")
      : headers;
    if (filtered.length) {
      const entries = filtered.map(
        (h) => `    ${jsString(h.key)}: ${jsString(h.value)}`,
      );
      configParts.push(`headers: {\n${entries.join(",\n")}\n  }`);
    }
  }

  if (isForm) {
    configParts.push("data: formData");
  } else if (bodyExpr != null) {
    if (req.bodyType === "json" || req.bodyType === "graphql") {
      try {
        JSON.parse(req.body ?? "");
        configParts.push(`data: ${bodyExpr}`);
      } catch {
        configParts.push(`data: ${bodyExpr}`);
      }
    } else {
      configParts.push(`data: ${bodyExpr}`);
    }
  }

  lines.push("const response = await axios({");
  lines.push(`  ${configParts.join(",\n  ")}`);
  lines.push("});");
  lines.push("");
  lines.push("console.log(response.data);");
  return lines.join("\n");
}

export function generateJsXhr(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const bodyExpr = bodyExpression(req);
  const lines: string[] = [
    "const xhr = new XMLHttpRequest();",
    `xhr.open(${jsString(method)}, ${jsString(req.url || "")});`,
  ];
  for (const h of headers) {
    lines.push(
      `xhr.setRequestHeader(${jsString(h.key)}, ${jsString(h.value)});`,
    );
  }
  lines.push("xhr.onload = function () {");
  lines.push("  console.log(xhr.responseText);");
  lines.push("};");
  if (bodyExpr != null && req.bodyType !== "form-data") {
    if (req.bodyType === "json" || req.bodyType === "graphql") {
      try {
        JSON.parse(req.body ?? "");
        lines.push(`xhr.send(JSON.stringify(${bodyExpr}));`);
      } catch {
        lines.push(`xhr.send(${bodyExpr});`);
      }
    } else {
      lines.push(`xhr.send(${bodyExpr});`);
    }
  } else {
    lines.push("xhr.send();");
  }
  return lines.join("\n");
}

export function generateJsJquery(req: EffectiveRequest): string {
  const method = req.method.toUpperCase();
  const headers = headersWithContentType(req);
  const bodyExpr = bodyExpression(req);
  const lines: string[] = ["$.ajax({"];
  lines.push(`  url: ${jsString(req.url || "")},`);
  lines.push(`  method: ${jsString(method)},`);
  if (headers.length) {
    const entries = headers.map(
      (h) => `    ${jsString(h.key)}: ${jsString(h.value)}`,
    );
    lines.push(`  headers: {\n${entries.join(",\n")}\n  },`);
  }
  if (bodyExpr != null && req.bodyType !== "form-data") {
    if (req.bodyType === "json" || req.bodyType === "graphql") {
      try {
        JSON.parse(req.body ?? "");
        lines.push(`  data: JSON.stringify(${bodyExpr}),`);
        lines.push(`  contentType: "application/json",`);
      } catch {
        lines.push(`  data: ${bodyExpr},`);
      }
    } else {
      lines.push(`  data: ${bodyExpr},`);
    }
  }
  lines.push("  success: function (response) {");
  lines.push("    console.log(response);");
  lines.push("  }");
  lines.push("});");
  return lines.join("\n");
}
