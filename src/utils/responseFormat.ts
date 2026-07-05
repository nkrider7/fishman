export type ResponseFormat =
  | "auto"
  | "json"
  | "html"
  | "xml"
  | "javascript"
  | "text";

export type ResolvedResponseFormat = Exclude<ResponseFormat, "auto">;

export const RESPONSE_FORMAT_OPTIONS: {
  value: ResponseFormat;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "javascript", label: "JavaScript" },
  { value: "text", label: "Raw" },
];

function getHeaderContentType(headers: Record<string, string>): string {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type",
  );
  return entry?.[1]?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function sniffFormatFromBody(body: string): ResolvedResponseFormat {
  const trimmed = body.trim();
  if (!trimmed) return "text";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }

  if (
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed)
  ) {
    return "html";
  }

  if (trimmed.startsWith("<?xml") || /^<[\w-]+[\s>]/.test(trimmed)) {
    return "xml";
  }

  return "text";
}

export function detectResponseFormat(
  headers: Record<string, string>,
  body: string,
): ResolvedResponseFormat {
  const contentType = getHeaderContentType(headers);

  if (contentType.includes("json")) return "json";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("xml")) return "xml";
  if (
    contentType.includes("javascript") ||
    contentType.includes("ecmascript")
  ) {
    return "javascript";
  }
  if (contentType.startsWith("text/")) return "text";

  return sniffFormatFromBody(body);
}

export function resolveResponseFormat(
  format: ResponseFormat,
  headers: Record<string, string>,
  body: string,
): ResolvedResponseFormat {
  if (format === "auto") {
    return detectResponseFormat(headers, body);
  }
  return format;
}

export function getMonacoLanguage(
  format: ResolvedResponseFormat,
): string {
  switch (format) {
    case "json":
      return "json";
    case "html":
      return "html";
    case "xml":
      return "xml";
    case "javascript":
      return "javascript";
    default:
      return "plaintext";
  }
}

const HTML_DOCUMENT_PATTERN = /<!doctype\s+html|<html[\s>]/i;

/** Wrap fragments and ensure a UTF-8 document for iframe preview. */
export function prepareHtmlForPreview(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) {
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
  }

  if (HTML_DOCUMENT_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${trimmed}</body></html>`;
}
