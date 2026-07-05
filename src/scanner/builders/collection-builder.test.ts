import { describe, expect, it } from "vitest";
import { buildCollectionFromEndpoints } from "../builders/collection-builder";
import type { ApiEndpoint } from "../models/endpoint";

function makeEndpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    id: "ep-1",
    name: "GET Users",
    method: "GET",
    path: "/users",
    tags: ["express"],
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

describe("buildCollectionFromEndpoints", () => {
  it("creates nested folders from endpoint folder paths", () => {
    const endpoints = [
      makeEndpoint({ id: "1", folder: ["Auth"], path: "/login", name: "POST Login", method: "POST" }),
      makeEndpoint({ id: "2", folder: ["Auth"], path: "/register", name: "POST Register", method: "POST" }),
      makeEndpoint({ id: "3", folder: ["Users"], path: "/users/:id", name: "GET User", method: "GET" }),
    ];

    const collection = buildCollectionFromEndpoints(endpoints, {
      collectionName: "My API",
      baseUrl: "http://localhost:3000",
    });

    expect(collection.rootFolder.name).toBe("My API");
    expect(collection.folders).toHaveLength(2);
    expect(collection.requests).toHaveLength(3);
    expect(collection.requests[2].draft.url).toBe("http://localhost:3000/users/:id");
  });

  it("filters endpoints by selected ids", () => {
    const endpoints = [
      makeEndpoint({ id: "keep" }),
      makeEndpoint({ id: "skip", path: "/skip" }),
    ];

    const collection = buildCollectionFromEndpoints(endpoints, {
      collectionName: "Filtered",
      selectedEndpointIds: new Set(["keep"]),
    });

    expect(collection.requests).toHaveLength(1);
    expect(collection.requests[0].endpoint.id).toBe("keep");
  });
});
