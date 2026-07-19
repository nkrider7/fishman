import { z } from "zod";
import type { RequestDraft } from "@/types/request";
import { getFormDataFilePaths } from "@/types/request";
import { ensureGraphQLConfig, validateGraphQLForSend } from "@/graphql";

export const requestDraftSchema = z.object({
  name: z.string(),
  method: z.string(),
  url: z
    .string()
    .min(1, "URL is required")
    .refine(
      (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return url.startsWith("http://") || url.startsWith("https://");
        }
      },
      { message: "Enter a valid URL (http:// or https://)" },
    ),
  params: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      enabled: z.boolean(),
    }),
  ),
  headers: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      enabled: z.boolean(),
    }),
  ),
  bodyType: z.string(),
  body: z.string(),
  formDataFields: z
    .array(
      z.object({
        id: z.string(),
        key: z.string(),
        type: z.enum(["text", "file"]),
        value: z.string(),
        filePaths: z.array(z.string()).optional(),
        filePath: z.string().optional(),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  graphql: z
    .object({
      query: z.string(),
      variables: z.string(),
      operationName: z.string().nullable(),
      schemaSource: z.enum(["introspection", "sdl", "none"]).optional(),
      transport: z.enum(["http", "ws"]).optional(),
    })
    .optional(),
  auth: z.object({ type: z.string() }).passthrough(),
  scripts: z
    .object({
      preRequest: z.string(),
      postResponse: z.string(),
      tests: z.string(),
    })
    .optional(),
});

export function validateRequest(draft: RequestDraft): string | null {
  const result = requestDraftSchema.safeParse(draft);
  if (!result.success) {
    return result.error.issues[0]?.message ?? "Invalid request";
  }

  if (draft.bodyType === "form-data") {
    const fields = draft.formDataFields ?? [];
    const enabled = fields.filter((f) => f.enabled && f.key.trim());

    for (const field of enabled) {
      if (field.type === "file" && getFormDataFilePaths(field).length === 0) {
        return `Form field "${field.key}" is missing a file`;
      }
    }

    if (enabled.length === 0) {
      return "Add at least one enabled form field";
    }
  }

  if (draft.bodyType === "graphql") {
    const graphql = ensureGraphQLConfig(draft);
    const gqlError = validateGraphQLForSend(graphql);
    if (gqlError) return gqlError;
  }

  return null;
}
