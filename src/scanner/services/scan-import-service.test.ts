import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEndpoint } from "../models/endpoint";
import type { ScanResult } from "../models/scan-result";

vi.mock("@/services/dbService", () => ({
  getCollections: vi.fn(),
  deleteFolder: vi.fn(),
  importCollection: vi.fn(),
}));

import {
  getCollections,
  deleteFolder,
  importCollection,
} from "@/services/dbService";
import { importScannedEndpoints } from "./scan-import-service";

function makeEndpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    id: "ep-1",
    name: "GET Users",
    method: "GET",
    path: "/users",
    tags: [],
    folder: ["Users"],
    headers: [],
    queryParameters: [],
    pathParameters: [],
    responses: [{ statusCode: 200 }],
    middleware: [],
    sourceFile: "routes/users.ts",
    framework: "express",
    warnings: [],
    ...overrides,
  };
}

function makeResult(endpoints: ApiEndpoint[]): ScanResult {
  return {
    projectPath: "/tmp/backend-server",
    language: "node",
    framework: "express",
    frameworks: ["express"],
    endpoints,
    warnings: [],
    scannedFiles: endpoints.length,
    durationMs: 1,
  };
}

describe("importScannedEndpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCollections).mockResolvedValue([]);
    vi.mocked(deleteFolder).mockResolvedValue(undefined);
    vi.mocked(importCollection).mockResolvedValue({ folders: [], requests: [] });
  });

  it("imports a new collection when no conflict exists", async () => {
    await importScannedEndpoints(makeResult([makeEndpoint()]), {
      collectionName: "backend-server API",
      workspaceId: "ws-1",
    });

    expect(deleteFolder).not.toHaveBeenCalled();
    expect(importCollection).toHaveBeenCalledTimes(1);
    const [data, options] = vi.mocked(importCollection).mock.calls[0];
    expect(data.rootFolder.name).toBe("backend-server API");
    expect(data.folders.every((f) => f.parent_id != null)).toBe(true);
    expect(data.folders.some((f) => f.id === data.rootFolder.id)).toBe(false);
    expect(options?.workspaceId).toBe("ws-1");
  });

  it("deletes all same-named root collections before replace import", async () => {
    vi.mocked(getCollections)
      .mockResolvedValueOnce([
        {
          id: "old-1",
          workspace_id: "ws-1",
          parent_id: null,
          name: "backend-server API",
          sort_order: 1,
          created_at: 1,
          updated_at: 1,
        },
        {
          id: "old-2",
          workspace_id: "ws-1",
          parent_id: null,
          name: "backend-server API",
          sort_order: 2,
          created_at: 2,
          updated_at: 2,
        },
        {
          id: "other",
          workspace_id: "ws-1",
          parent_id: null,
          name: "Other API",
          sort_order: 3,
          created_at: 3,
          updated_at: 3,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "other",
          workspace_id: "ws-1",
          parent_id: null,
          name: "Other API",
          sort_order: 3,
          created_at: 3,
          updated_at: 3,
        },
      ]);

    await importScannedEndpoints(makeResult([makeEndpoint()]), {
      collectionName: "backend-server API",
      workspaceId: "ws-1",
      conflictStrategy: "replace",
    });

    expect(deleteFolder).toHaveBeenCalledTimes(2);
    expect(deleteFolder).toHaveBeenCalledWith("old-1");
    expect(deleteFolder).toHaveBeenCalledWith("old-2");
    expect(importCollection).toHaveBeenCalledTimes(1);
  });
});
