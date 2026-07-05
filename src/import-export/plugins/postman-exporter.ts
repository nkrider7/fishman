import type { ExportContext, ExportPlugin } from "../core/types";
import type { RequestDraft } from "@/types/request";
import { deserializeBodyFromStorage } from "@/types/request";

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: Record<string, unknown>;
}

function buildAuth(auth: RequestDraft["auth"]): Record<string, unknown> | undefined {
  switch (auth.type) {
    case "bearer":
      return {
        type: "bearer",
        bearer: [{ key: "token", value: auth.bearer?.token ?? "", type: "string" }],
      };
    case "basic":
      return {
        type: "basic",
        basic: [
          { key: "username", value: auth.basic?.username ?? "", type: "string" },
          { key: "password", value: auth.basic?.password ?? "", type: "string" },
        ],
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: auth.apikey?.key ?? "", type: "string" },
          { key: "value", value: auth.apikey?.value ?? "", type: "string" },
          {
            key: "in",
            value: auth.apikey?.addTo === "query" ? "query" : "header",
            type: "string",
          },
        ],
      };
    case "oauth2":
      return {
        type: "oauth2",
        oauth2: [
          {
            key: "accessToken",
            value: auth.oauth2?.accessToken ?? "",
            type: "string",
          },
        ],
      };
    default:
      return { type: "noauth" };
  }
}

function buildBody(draft: RequestDraft): Record<string, unknown> | undefined {
  const { body, formDataFields } = deserializeBodyFromStorage(
    draft.bodyType,
    draft.bodyType === "form-data"
      ? JSON.stringify(draft.formDataFields ?? [])
      : draft.body,
  );

  switch (draft.bodyType) {
    case "none":
      return undefined;
    case "form-data":
      return {
        mode: "formdata",
        formdata: (formDataFields ?? []).map((f) => ({
          key: f.key,
          value: f.type === "text" ? f.value : undefined,
          type: f.type === "file" ? "file" : "text",
          src: f.type === "file" && f.filePath ? f.filePath : undefined,
          disabled: !f.enabled,
        })),
      };
    case "x-www-form-urlencoded":
      return {
        mode: "urlencoded",
        urlencoded: draft.body
          .split("&")
          .filter(Boolean)
          .map((pair) => {
            const [key, ...rest] = pair.split("=");
            return {
              key: decodeURIComponent(key ?? ""),
              value: decodeURIComponent(rest.join("=") ?? ""),
            };
          }),
      };
    case "graphql":
      return { mode: "graphql", raw: body, graphql: {} };
    case "xml":
      return {
        mode: "raw",
        raw: body,
        options: { raw: { language: "xml" } },
      };
    case "html":
      return {
        mode: "raw",
        raw: body,
        options: { raw: { language: "html" } },
      };
    case "json":
      return {
        mode: "raw",
        raw: body,
        options: { raw: { language: "json" } },
      };
    default:
      return { mode: "raw", raw: body };
  }
}

function buildRequest(draft: RequestDraft): Record<string, unknown> {
  const enabledParams = draft.params.filter((p) => p.enabled && p.key);
  const request: Record<string, unknown> = {
    method: draft.method,
    header: draft.headers.map((h) => ({
      key: h.key,
      value: h.value,
      disabled: !h.enabled,
    })),
    url: enabledParams.length
      ? {
          raw: draft.url,
          query: enabledParams.map((p) => ({
            key: p.key,
            value: p.value,
            disabled: !p.enabled,
          })),
        }
      : draft.url,
  };

  const body = buildBody(draft);
  if (body) request.body = body;

  const auth = buildAuth(draft.auth);
  if (auth && auth.type !== "noauth") request.auth = auth;

  return request;
}

function buildItems(
  parentId: string,
  folders: ExportContext["data"]["folders"],
  requests: ExportContext["data"]["requests"],
): PostmanItem[] {
  const childFolders = folders.filter((f) => f.parent_id === parentId);
  const childRequests = requests.filter((r) => r.collection_id === parentId);

  const folderItems: PostmanItem[] = childFolders.map((f) => ({
    name: f.name,
    item: buildItems(f.id, folders, requests),
  }));

  const requestItems: PostmanItem[] = childRequests.map((r) => ({
    name: r.draft.name,
    request: buildRequest(r.draft),
  }));

  return [...folderItems, ...requestItems];
}

export const postmanExporter: ExportPlugin = {
  id: "postman",
  name: "Postman",
  extensions: ["json"],
  defaultExtension: "json",
  mimeType: "application/json",

  serialize({ data, options }: ExportContext): string {
    const variables =
      options.includeVariables === false
        ? []
        : (data.variables ?? []).map((v) => ({
            key: v.key,
            value: v.value,
            disabled: !v.enabled,
          }));

    const collection = {
      info: {
        name: data.rootFolder.name,
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        _postman_id: data.rootFolder.id,
      },
      item: buildItems(data.rootFolder.id, data.folders, data.requests),
      variable: variables,
    };

    return JSON.stringify(collection, null, 2);
  },
};
