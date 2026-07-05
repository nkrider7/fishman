import type {
  FormDataField,
  HttpMethod,
  KeyValue,
  RequestDraft,
} from "@/types/request";
import { generateId } from "@/utils/id";
import type { ImportResult, ImportWarning, ImportPlugin } from "../core/types";

interface PostmanUrl {
  raw?: string;
  host?: string | string[];
  path?: string | string[];
  query?: { key: string; value: string; disabled?: boolean }[];
}

interface PostmanAuthAttribute {
  key: string;
  value: string;
  type?: string;
}

/** Postman v2.1 uses arrays; v2.0 uses plain objects keyed by param name. */
type PostmanAuthEntries =
  | PostmanAuthAttribute[]
  | Record<string, string | undefined>;

interface PostmanAuth {
  type?: string;
  bearer?: PostmanAuthEntries;
  basic?: PostmanAuthEntries;
  apikey?: PostmanAuthEntries;
  oauth2?: PostmanAuthEntries;
}

interface PostmanFormDataItem {
  key: string;
  value?: string;
  type?: string;
  src?: string | string[];
  disabled?: boolean;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  urlencoded?: { key: string; value: string; disabled?: boolean }[];
  formdata?: PostmanFormDataItem[];
  options?: { raw?: { language?: string } };
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: {
    method?: string;
    header?: { key: string; value: string; disabled?: boolean }[];
    url?: string | PostmanUrl;
    body?: PostmanBody;
    auth?: PostmanAuth;
  };
}

interface PostmanCollection {
  info?: { name?: string; schema?: string };
  item?: PostmanItem[];
  variable?: { key: string; value: string; disabled?: boolean }[];
  auth?: PostmanAuth;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Invalid JSON: ${message}`);
  }
}

function isPostmanCollection(data: unknown): data is PostmanCollection {
  if (!data || typeof data !== "object") return false;
  const doc = data as Record<string, unknown>;
  if (!Array.isArray(doc.item)) return false;
  const info = doc.info as { schema?: string } | undefined;
  if (info?.schema?.includes("postman.com/json/collection")) return true;
  if (doc.info && Array.isArray(doc.item)) return true;
  return false;
}

function parseUrl(url?: string | PostmanUrl): {
  url: string;
  params: KeyValue[];
} {
  if (!url) return { url: "", params: [] };
  if (typeof url === "string") return { url, params: [] };

  const raw = url.raw ?? "";
  const queryParams = (url.query ?? []).map((q) => ({
    id: generateId(),
    key: q.key,
    value: q.value ?? "",
    enabled: !q.disabled,
  }));

  if (raw) return { url: raw, params: queryParams };

  const host = Array.isArray(url.host) ? url.host.join(".") : url.host ?? "";
  const path = Array.isArray(url.path) ? `/${url.path.join("/")}` : url.path ?? "";
  return { url: host ? `https://${host}${path}` : path, params: queryParams };
}

function parseHeaders(
  headers?: { key: string; value: string; disabled?: boolean }[],
): KeyValue[] {
  return (headers ?? []).map((h) => ({
    id: generateId(),
    key: h.key,
    value: h.value,
    enabled: !h.disabled,
  }));
}

function parseBody(
  body?: PostmanBody,
): Pick<RequestDraft, "bodyType" | "body" | "formDataFields"> {
  if (!body) {
    return { bodyType: "none", body: "", formDataFields: [] };
  }

  if (body.mode === "formdata" && body.formdata) {
    const formDataFields: FormDataField[] = body.formdata.map((item) => {
      const isFile = item.type === "file";
      const src = Array.isArray(item.src) ? item.src[0] : item.src;
      return {
        id: generateId(),
        key: item.key,
        type: isFile ? "file" : "text",
        value: isFile
          ? src
            ? (src.split(/[/\\]/).pop() ?? src)
            : ""
          : (item.value ?? ""),
        filePath: isFile && src ? src : undefined,
        enabled: !item.disabled,
      };
    });
    return { bodyType: "form-data", body: "", formDataFields };
  }

  if (body.mode === "urlencoded") {
    const pairs = body.urlencoded ?? [];
    const encoded = pairs
      .filter((p) => !p.disabled && p.key)
      .map(
        (p) =>
          `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? "")}`,
      )
      .join("&");
    return {
      bodyType: "x-www-form-urlencoded",
      body: encoded,
      formDataFields: [],
    };
  }

  if (body.mode === "graphql" && body.raw) {
    return { bodyType: "graphql", body: body.raw, formDataFields: [] };
  }

  if (!body.raw) return { bodyType: "none", body: "", formDataFields: [] };

  const language = body.options?.raw?.language?.toLowerCase();
  if (language === "xml") {
    return { bodyType: "xml", body: body.raw, formDataFields: [] };
  }
  if (language === "html") {
    return { bodyType: "html", body: body.raw, formDataFields: [] };
  }
  if (body.mode === "raw" || language === "json") {
    return { bodyType: "json", body: body.raw, formDataFields: [] };
  }

  return { bodyType: "raw", body: body.raw, formDataFields: [] };
}

function normalizeAuthEntries(
  entries: PostmanAuthEntries | undefined,
): PostmanAuthAttribute[] {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;

  if (typeof entries === "object") {
    return Object.entries(entries)
      .filter(([key]) => key !== "type")
      .map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : "",
      }));
  }

  return [];
}

function getAuthValue(
  entries: PostmanAuthEntries | undefined,
  key: string,
): string {
  return normalizeAuthEntries(entries).find((e) => e.key === key)?.value ?? "";
}

function parseAuth(auth?: PostmanAuth): RequestDraft["auth"] {
  if (!auth?.type || auth.type === "noauth") return { type: "none" };

  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: { token: getAuthValue(auth.bearer, "token") },
    };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: {
        username: getAuthValue(auth.basic, "username"),
        password: getAuthValue(auth.basic, "password"),
      },
    };
  }
  if (auth.type === "apikey") {
    const key = getAuthValue(auth.apikey, "key");
    const value = getAuthValue(auth.apikey, "value");
    const addToRaw = getAuthValue(auth.apikey, "in");
    return {
      type: "apikey",
      apikey: {
        key,
        value,
        addTo: addToRaw === "query" ? "query" : "header",
      },
    };
  }
  if (auth.type === "oauth2") {
    return {
      type: "oauth2",
      oauth2: {
        accessToken:
          getAuthValue(auth.oauth2, "accessToken") ||
          getAuthValue(auth.oauth2, "access_token"),
      },
    };
  }

  return { type: "none" };
}

function parseVariables(
  variables?: { key: string; value: string; disabled?: boolean }[],
): KeyValue[] {
  return (variables ?? [])
    .filter((v) => !v.disabled && v.key)
    .map((v) => ({
      id: generateId(),
      key: v.key,
      value: v.value ?? "",
      enabled: true,
    }));
}

function walkItems(
  items: PostmanItem[],
  parentId: string,
  folders: ImportResult["folders"],
  requests: ImportResult["requests"],
  warnings: ImportWarning[],
  sortBase: number,
  inheritedAuth?: PostmanAuth,
) {
  items.forEach((item, index) => {
    const sortOrder = sortBase + index;

    if (item.item && item.item.length > 0) {
      const folderId = generateId();
      folders.push({
        id: folderId,
        parent_id: parentId,
        name: item.name,
        sort_order: sortOrder,
      });
      walkItems(
        item.item,
        folderId,
        folders,
        requests,
        warnings,
        sortOrder * 1000,
        inheritedAuth,
      );
    } else if (item.request) {
      const req = item.request;
      const { url, params } = parseUrl(req.url);
      const { bodyType, body, formDataFields } = parseBody(req.body);
      const auth = req.auth?.type ? parseAuth(req.auth) : parseAuth(inheritedAuth);

      if (!url.trim()) {
        warnings.push({
          message: `Request "${item.name}" has an empty URL.`,
          path: item.name,
        });
      }

      const draft: RequestDraft = {
        id: generateId(),
        name: item.name,
        method: (req.method?.toUpperCase() ?? "GET") as HttpMethod,
        url,
        params,
        headers: parseHeaders(req.header),
        bodyType,
        body,
        formDataFields,
        auth,
        collectionId: parentId,
      };
      requests.push({
        id: draft.id,
        collection_id: parentId,
        name: item.name,
        draft,
        sort_order: sortOrder,
      });
    }
  });
}

export const postmanImporter: ImportPlugin = {
  id: "postman",
  name: "Postman",
  extensions: ["json"],

  detect(content, filename) {
    if (filename?.endsWith(".fishman.json")) return false;
    try {
      const data = JSON.parse(content);
      if (isFishmanDocument(data)) return false;
      return isPostmanCollection(data);
    } catch {
      return false;
    }
  },

  validate(content) {
    try {
      const data = parseJson(content);
      if (isFishmanDocument(data)) {
        return [
          {
            message: "This is a Fishman collection file.",
            suggestion: "Use Fishman import format instead.",
          },
        ];
      }
      if (!isPostmanCollection(data)) {
        return [
          {
            message: "Not a valid Postman collection.",
            suggestion:
              "Ensure the file is a Postman Collection v2 or v2.1 export.",
          },
        ];
      }
      return [];
    } catch (error) {
      return [
        {
          message: error instanceof Error ? error.message : "Invalid JSON",
          suggestion: "Check that the file contains valid JSON.",
        },
      ];
    }
  },

  parse(content) {
    const data = parseJson(content) as PostmanCollection;
    const name = data.info?.name ?? "Imported Collection";
    const rootId = generateId();
    const warnings: ImportWarning[] = [];
    const folders: ImportResult["folders"] = [];
    const requests: ImportResult["requests"] = [];

    walkItems(
      data.item ?? [],
      rootId,
      folders,
      requests,
      warnings,
      Date.now(),
      data.auth,
    );

    return {
      rootFolder: {
        id: rootId,
        parent_id: null,
        name,
        sort_order: Date.now(),
      },
      folders,
      requests,
      variables: parseVariables(data.variable),
      warnings,
    };
  },
};

function isFishmanDocument(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const doc = data as Record<string, unknown>;
  return doc.app === "Fishman" && typeof doc.version === "number";
}
