import { z } from "zod";
import { FISHMAN_PROJECT_FORMAT_VERSION } from "./version";

export const fishKvSchema = z
  .object({
    id: z.string().optional(),
    key: z.string(),
    value: z.string().default(""),
    enabled: z.boolean().default(true),
    secret: z.boolean().optional(),
  })
  .passthrough();

export const fishFormDataFieldSchema = z
  .object({
    id: z.string().optional(),
    key: z.string(),
    type: z.enum(["text", "file"]).default("text"),
    value: z.string().default(""),
    filePaths: z.array(z.string()).optional(),
    enabled: z.boolean().default(true),
  })
  .passthrough();

export const fishBodySchema = z
  .object({
    type: z
      .enum([
        "none",
        "json",
        "form-data",
        "x-www-form-urlencoded",
        "raw",
        "xml",
        "html",
        "graphql",
        "binary",
      ])
      .default("none"),
    content: z.string().default(""),
    formData: z.array(fishFormDataFieldSchema).optional(),
    /** Structured GraphQL fields (optional; content remains wire JSON). */
    graphql: z
      .object({
        query: z.string(),
        variables: z.string().default("{\n  \n}"),
        operationName: z.string().nullable().default(null),
        schemaSource: z.enum(["introspection", "sdl", "none"]).optional(),
        transport: z.enum(["http", "ws"]).optional(),
      })
      .optional(),
  })
  .passthrough();

export const fishAuthSchema = z
  .object({
    type: z
      .enum([
        "none",
        "inherit",
        "bearer",
        "apikey",
        "basic",
        "oauth2",
        "jwt",
        "custom",
      ])
      .default("none"),
    bearer: z.object({ token: z.string() }).optional(),
    apikey: z
      .object({
        key: z.string(),
        value: z.string(),
        addTo: z.enum(["header", "query"]).default("header"),
      })
      .optional(),
    basic: z
      .object({ username: z.string(), password: z.string() })
      .optional(),
    oauth2: z.object({ accessToken: z.string() }).optional(),
    jwt: z.object({ token: z.string() }).optional(),
    custom: z.object({ key: z.string(), value: z.string() }).optional(),
  })
  .passthrough();

export const fishScriptsSchema = z
  .object({
    preRequest: z.string().default(""),
    postResponse: z.string().default(""),
    tests: z.string().default(""),
  })
  .passthrough();

/** One HTTP request — stored as `<Name>.fish` (pretty JSON). */
export const fishRequestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    method: z.string().min(1),
    url: z.string().default(""),
    headers: z.array(fishKvSchema).default([]),
    query: z.array(fishKvSchema).default([]),
    body: fishBodySchema.default({ type: "none", content: "" }),
    auth: fishAuthSchema.default({ type: "none" }),
    scripts: fishScriptsSchema.default({
      preRequest: "",
      postResponse: "",
      tests: "",
    }),
    variables: z.array(fishKvSchema).default([]),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    favorite: z.boolean().optional(),
    seq: z.number().int().optional(),
    source: z
      .object({
        kind: z.enum(["manual", "scanner"]).default("manual"),
        locked: z.boolean().default(false),
        routeFile: z.string().optional(),
        endpointId: z.string().optional(),
      })
      .passthrough()
      .optional(),
    createdAt: z.string().default(""),
    updatedAt: z.string().default(""),
  })
  .passthrough();

export const fishFolderMetaSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    seq: z.number().int().optional(),
    description: z.string().optional(),
    headers: z.array(fishKvSchema).optional(),
    variables: z.array(fishKvSchema).optional(),
    postResponseVars: z
      .array(
        z
          .object({
            id: z.string().optional(),
            key: z.string(),
            expr: z.string().default(""),
            enabled: z.boolean().default(true),
          })
          .passthrough(),
      )
      .optional(),
    auth: fishAuthSchema.optional(),
    scripts: fishScriptsSchema.optional(),
    presets: z
      .object({
        defaultMethod: z.string().optional(),
        baseUrl: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const fishEnvironmentSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    seq: z.number().int().default(0),
    variables: z.array(fishKvSchema).default([]),
  })
  .passthrough();

export const fishWorkspaceSchema = z
  .object({
    version: z.literal(FISHMAN_PROJECT_FORMAT_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    activeEnvironment: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export type FishKeyValue = z.infer<typeof fishKvSchema>;
export type FishFormDataField = z.infer<typeof fishFormDataFieldSchema>;
export type FishBody = z.infer<typeof fishBodySchema>;
export type FishAuth = z.infer<typeof fishAuthSchema>;
export type FishScripts = z.infer<typeof fishScriptsSchema>;
export type FishRequest = z.infer<typeof fishRequestSchema>;
export type FishFolderMeta = z.infer<typeof fishFolderMetaSchema>;
export type FishEnvironment = z.infer<typeof fishEnvironmentSchema>;
export type FishWorkspace = z.infer<typeof fishWorkspaceSchema>;
