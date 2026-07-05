import type { ExportContext, ExportPlugin } from "../core/types";
import type { FishmanExportDocument } from "../models/fishman";
import { FISHMAN_EXPORT_VERSION } from "../models/fishman";
import type { RequestDraft } from "@/types/request";
import { serializeBodyForStorage } from "@/types/request";

function redactSecrets(
  requests: Array<{ sort_order: number; collection_id: string; draft: RequestDraft }>,
  includeSecrets: boolean,
) {
  if (includeSecrets) return requests;
  return requests.map((r) => {
    const auth = { ...r.draft.auth };
    if (auth.basic) auth.basic = { ...auth.basic, password: "" };
    if (auth.bearer) auth.bearer = { ...auth.bearer, token: "" };
    if (auth.apikey) auth.apikey = { ...auth.apikey, value: "" };
    if (auth.oauth2) auth.oauth2 = { ...auth.oauth2, accessToken: "" };
    if (auth.jwt) auth.jwt = { ...auth.jwt, token: "" };
    return {
      ...r,
      draft: {
        ...r.draft,
        auth,
        body:
          r.draft.bodyType === "form-data"
            ? serializeBodyForStorage(r.draft)
            : r.draft.body,
      },
    };
  });
}

export const fishmanExporter: ExportPlugin = {
  id: "fishman",
  name: "Fishman",
  extensions: ["fishman.json"],
  defaultExtension: "fishman.json",
  mimeType: "application/json",

  serialize({ data, options }: ExportContext): string {
    const includeSecrets = options.includeSecrets ?? false;
    const childFolders = data.folders
      .filter((f) => f.id !== data.rootFolder.id)
      .map((f) => ({
        id: f.id,
        name: f.name,
        parent_id: f.parent_id,
        sort_order: f.sort_order,
      }));

    const doc: FishmanExportDocument = {
      version: FISHMAN_EXPORT_VERSION,
      app: "Fishman",
      exportedAt: new Date().toISOString(),
      collection: {
        id: data.rootFolder.id,
        name: data.rootFolder.name,
        variables: options.includeVariables === false ? [] : data.variables,
        folders: childFolders,
        requests: redactSecrets(data.requests, includeSecrets).map((r) => ({
          id: r.draft.id,
          collection_id: r.collection_id,
          name: r.draft.name,
          sort_order: r.sort_order,
          draft: r.draft,
        })),
      },
      environments:
        options.includeVariables === false
          ? []
          : (data.environments ?? []).map((env) => ({
              id: env.id,
              name: env.name,
              variables: env.variables,
              sort_order: env.sort_order,
            })),
      metadata: {
        includeSecrets,
        includeMetadata: options.includeMetadata ?? true,
      },
    };

    return JSON.stringify(doc, null, 2);
  },
};
