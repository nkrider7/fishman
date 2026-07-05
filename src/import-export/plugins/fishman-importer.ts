import type { ImportWarning } from "../core/types";
import type { FishmanExportDocument } from "../models/fishman";
import { FISHMAN_EXPORT_VERSION } from "../models/fishman";
import type { ImportPlugin } from "../core/types";
import { generateId } from "@/utils/id";
import type { KeyValue } from "@/types/request";

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Invalid JSON: ${message}`);
  }
}

function isFishmanDocument(data: unknown): data is FishmanExportDocument {
  if (!data || typeof data !== "object") return false;
  const doc = data as Record<string, unknown>;
  return (
    doc.app === "Fishman" &&
    doc.version === FISHMAN_EXPORT_VERSION &&
    typeof doc.collection === "object" &&
    doc.collection !== null
  );
}

function migrateFishmanDocument(data: Record<string, unknown>): FishmanExportDocument {
  const version = data.version;
  if (version === FISHMAN_EXPORT_VERSION && isFishmanDocument(data)) {
    return data;
  }
  throw new Error(`Unsupported Fishman export version: ${String(version)}`);
}

function mapVariables(raw: unknown): KeyValue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      id: typeof v.id === "string" ? v.id : generateId(),
      key: String(v.key ?? ""),
      value: String(v.value ?? ""),
      enabled: v.enabled !== false,
    }));
}

export const fishmanImporter: ImportPlugin = {
  id: "fishman",
  name: "Fishman",
  extensions: ["fishman.json", "json"],

  detect(content, filename) {
    if (filename?.endsWith(".fishman.json")) return true;
    try {
      const data = JSON.parse(content);
      return isFishmanDocument(data);
    } catch {
      return false;
    }
  },

  validate(content) {
    try {
      const data = parseJson(content);
      if (!isFishmanDocument(data) && typeof data === "object" && data !== null) {
        const doc = data as Record<string, unknown>;
        if (doc.app === "Fishman") {
          return [
            {
              message: `Unsupported Fishman export version: ${String(doc.version)}`,
              suggestion: "Update Fishman or re-export from a newer version.",
            },
          ];
        }
      }
      if (!isFishmanDocument(data)) {
        return [
          {
            message: "Not a valid Fishman collection file.",
            suggestion: "Ensure the file was exported from Fishman.",
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
    const data = migrateFishmanDocument(
      parseJson(content) as Record<string, unknown>,
    );
    const warnings: ImportWarning[] = [];
    const collection = data.collection;

    if (!collection.id || !collection.name) {
      throw new Error("Fishman collection is missing id or name.");
    }

    const rootId = collection.id;
    const folders = (collection.folders ?? []).map((f) => ({
      id: f.id,
      parent_id: f.parent_id,
      name: f.name,
      sort_order: f.sort_order ?? Date.now(),
    }));

    const requests = (collection.requests ?? []).map((r, index) => {
      const draft = {
        ...r.draft,
        id: r.draft.id || r.id || generateId(),
        name: r.draft.name || r.name,
        formDataFields: r.draft.formDataFields ?? [],
        collectionId: r.collection_id,
        isFavorite: r.draft.isFavorite ?? false,
      };
      return {
        id: draft.id,
        collection_id: r.collection_id,
        name: draft.name,
        draft,
        sort_order: r.sort_order ?? index,
      };
    });

    for (const req of requests) {
      if (!req.draft.url?.trim()) {
        warnings.push({
          message: `Request "${req.name}" has an empty URL.`,
          path: req.name,
        });
      }
    }

    return {
      rootFolder: {
        id: rootId,
        parent_id: null,
        name: collection.name,
        sort_order: 0,
      },
      folders: folders.filter((f) => f.id !== rootId),
      requests,
      variables: mapVariables(collection.variables),
      warnings,
    };
  },
};
