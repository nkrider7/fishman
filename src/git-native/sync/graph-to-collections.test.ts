import { describe, expect, it } from "vitest";
import { createMemoryFs } from "@/git-native/fs/memory-fs";
import { createFishmanWorkspace } from "@/git-native/workspace/create";
import { graphToCollectionTree } from "@/git-native/sync/graph-to-collections";

describe("graphToCollectionTree", () => {
  it("maps workspace root + starter requests into sidebar rows", async () => {
    const fs = createMemoryFs();
    const graph = await createFishmanWorkspace(fs, {
      projectPath: "demo",
      name: "Demo API",
    });

    const tree = graphToCollectionTree(graph, { workspaceId: "fs:demo" });

    expect(tree.rootFolderId).toBe(graph.workspace.id);
    expect(tree.folders.some((f) => f.parent_id === null)).toBe(true);
    expect(tree.folders.find((f) => f.parent_id === null)?.name).toBe(
      "Demo API",
    );
    expect(tree.folders.some((f) => f.name === "Getting Started")).toBe(true);
    expect(tree.requests.some((r) => r.name === "Hello")).toBe(true);
    expect(
      tree.requests.every((r) => typeof r.collection_id === "string"),
    ).toBe(true);
  });
});
