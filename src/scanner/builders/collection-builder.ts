import type { ApiEndpoint } from "../models/endpoint";
import type { ScannedCollection } from "../models/collection";
import type { RequestDraft, FormDataField } from "@/types/request";
import type { KeyValue } from "@/types/request";
import { generateId } from "@/utils/id";

export interface CollectionBuilderOptions {
  collectionName: string;
  baseUrl?: string;
  selectedEndpointIds?: Set<string>;
}

export function buildCollectionFromEndpoints(
  endpoints: ApiEndpoint[],
  options: CollectionBuilderOptions,
): ScannedCollection {
  const selected = options.selectedEndpointIds
    ? endpoints.filter((ep) => options.selectedEndpointIds!.has(ep.id))
    : endpoints;

  const rootId = generateId();
  const now = Date.now();
  const folderMap = new Map<string, string>();
  const folders: ScannedCollection["folders"] = [];
  const requests: ScannedCollection["requests"] = [];

  const rootFolder = {
    id: rootId,
    parent_id: null as string | null,
    name: options.collectionName,
    sort_order: now,
  };

  for (const endpoint of selected) {
    const folderPath = endpoint.folder.length > 0 ? endpoint.folder : ["General"];
    let parentId = rootId;

    for (let i = 0; i < folderPath.length; i++) {
      const segment = folderPath[i];
      const key = `${parentId}/${segment}`;
      if (!folderMap.has(key)) {
        const folderId = generateId();
        folderMap.set(key, folderId);
        folders.push({
          id: folderId,
          parent_id: parentId,
          name: segment,
          sort_order: now + i,
        });
        parentId = folderId;
      } else {
        parentId = folderMap.get(key)!;
      }
    }

    const draft = endpointToRequestDraft(endpoint, options.baseUrl);
    requests.push({
      id: draft.id,
      collection_id: parentId,
      name: endpoint.name,
      draft,
      sort_order: now,
      endpoint,
    });
  }

  return { rootFolder, folders, requests };
}

function endpointToRequestDraft(
  endpoint: ApiEndpoint,
  baseUrl?: string,
): RequestDraft {
  const headers: KeyValue[] = endpoint.headers.map((h, i) => ({
    id: `h-${i}`,
    key: h.name,
    value: String(h.example ?? ""),
    enabled: true,
  }));

  if (endpoint.requestBody?.contentType) {
    const hasContentType = headers.some(
      (h) => h.key.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      headers.push({
        id: "content-type",
        key: "Content-Type",
        value: endpoint.requestBody.contentType,
        enabled: true,
      });
    }
  }

  const params: KeyValue[] = [
    ...endpoint.queryParameters.map((p, i) => ({
      id: `q-${i}`,
      key: p.name,
      value: String(p.example ?? ""),
      enabled: true,
    })),
  ];

  let url = endpoint.path;
  if (baseUrl) {
    const base = baseUrl.replace(/\/$/, "");
    url = `${base}${endpoint.path.startsWith("/") ? endpoint.path : `/${endpoint.path}`}`;
  }

  let auth: RequestDraft["auth"] = { type: "none" };
  if (endpoint.authentication?.required) {
    switch (endpoint.authentication.type) {
      case "bearer":
        auth = { type: "bearer", bearer: { token: "{{token}}" } };
        break;
      case "basic":
        auth = { type: "basic", basic: { username: "", password: "" } };
        break;
      case "apikey":
        auth = {
          type: "apikey",
          apikey: { key: "X-API-Key", value: "{{api_key}}", addTo: "header" },
        };
        break;
      default:
        auth = { type: "bearer", bearer: { token: "{{token}}" } };
    }
  }

  let bodyType: RequestDraft["bodyType"] = "none";
  let body = "";
  let formDataFields: FormDataField[] = [];
  if (endpoint.requestBody) {
    if (endpoint.requestBody.contentType.includes("multipart")) {
      bodyType = "form-data";
      const schema = endpoint.requestBody.schema ?? {};
      const example =
        endpoint.requestBody.example ?? endpoint.requestBody.raw ?? "";
      if (Object.keys(schema).length > 0) {
        formDataFields = Object.entries(schema).map(([key, value]) => ({
          id: generateId(),
          key,
          type: "text" as const,
          value: value == null ? "" : String(value),
          enabled: true,
        }));
      } else if (example) {
        try {
          const parsed: unknown = JSON.parse(example);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            formDataFields = Object.entries(parsed as Record<string, unknown>).map(
              ([key, value]) => ({
                id: generateId(),
                key,
                type: "text" as const,
                value: value == null ? "" : String(value),
                enabled: true,
              }),
            );
          }
        } catch {
          body = example;
        }
      }
    } else if (endpoint.requestBody.contentType.includes("x-www-form-urlencoded")) {
      bodyType = "x-www-form-urlencoded";
      const schema = endpoint.requestBody.schema ?? {};
      if (endpoint.requestBody.example || endpoint.requestBody.raw) {
        body = endpoint.requestBody.example ?? endpoint.requestBody.raw ?? "";
      } else if (Object.keys(schema).length > 0) {
        body = Object.entries(schema)
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(value == null ? "" : String(value))}`,
          )
          .join("&");
      } else {
        body = "";
      }
    } else {
      const schema = endpoint.requestBody.schema ?? {};
      bodyType = "json";
      body =
        endpoint.requestBody.example ??
        endpoint.requestBody.raw ??
        JSON.stringify(schema, null, 2);
    }
  }

  return {
    id: generateId(),
    name: endpoint.name,
    method: endpoint.method,
    url,
    params,
    headers,
    bodyType,
    body,
    formDataFields,
    auth,
    scripts: { preRequest: "", postResponse: "", tests: "" },
    collectionId: undefined,
  };
}
