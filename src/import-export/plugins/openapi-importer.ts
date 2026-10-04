import type { ImportError, ImportPlugin } from "../core/types";
import {
  detectOpenApiContent,
  mapSpecToImportResult,
  parseSpecContent,
  detectSpecFormat,
  isOpenApiOrSwagger,
} from "@/openapi";

function validateOpenApi(content: string): ImportError[] {
  try {
    const doc = parseSpecContent(content);
    if (!isOpenApiOrSwagger(doc)) {
      return [
        {
          message:
            "Not a valid OpenAPI or Swagger document (missing openapi/swagger field).",
          suggestion: "Provide an OpenAPI 3.x or Swagger 2.0 JSON/YAML file.",
        },
      ];
    }
    if (!doc.paths || typeof doc.paths !== "object") {
      return [
        {
          message: "Spec is missing a paths object.",
          suggestion: "Ensure the document defines at least one path.",
        },
      ];
    }
    return [];
  } catch (error) {
    return [
      {
        message:
          error instanceof Error ? error.message : "Invalid OpenAPI document",
        suggestion:
          "Check that the file is valid JSON or YAML OpenAPI/Swagger.",
      },
    ];
  }
}

export const openapiImporter: ImportPlugin = {
  id: "openapi",
  name: "OpenAPI / Swagger",
  extensions: ["json", "yaml", "yml"],
  detect(content, filename) {
    return detectOpenApiContent(content, filename);
  },
  validate: validateOpenApi,
  parse(content) {
    return mapSpecToImportResult(content);
  },
};

export function openApiFormatLabel(content: string, filename?: string): string {
  try {
    const doc = parseSpecContent(content, filename);
    const { format, version } = detectSpecFormat(doc);
    if (format === "swagger") return `Swagger ${version}`;
    if (format === "openapi") return `OpenAPI ${version}`;
  } catch {
    // ignore
  }
  return "OpenAPI / Swagger";
}
