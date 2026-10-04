import { parseSpecContent, detectSpecFormat, isOpenApiOrSwagger } from "./parse";

export function detectOpenApiContent(
  content: string,
  filename?: string,
): boolean {
  try {
    const doc = parseSpecContent(content, filename);
    return isOpenApiOrSwagger(doc);
  } catch {
    return false;
  }
}

export function detectOpenApiVersionLabel(
  content: string,
  filename?: string,
): string | null {
  try {
    const doc = parseSpecContent(content, filename);
    const { format, version } = detectSpecFormat(doc);
    if (format === "unknown") return null;
    return format === "swagger" ? `Swagger ${version}` : `OpenAPI ${version}`;
  } catch {
    return null;
  }
}
