import { describe, expect, it } from "vitest";
import type { CollectionFolder } from "@/types/collection";
import type { KeyValue } from "@/types/request";
import {
  buildFolderChain,
  extractJsonPath,
  mergeFolderVariables,
  mergeHeaders,
  resolveInheritedAuth,
  collectFolderScripts,
  joinScripts,
} from "./index";

function folder(
  partial: Partial<CollectionFolder> & Pick<CollectionFolder, "id" | "name">,
): CollectionFolder {
  return {
    workspace_id: "ws",
    parent_id: null,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

function kv(key: string, value: string, enabled = true): KeyValue {
  return { id: key, key, value, enabled };
}

describe("inheritance", () => {
  const folders = [
    folder({
      id: "root",
      name: "API",
      headers_json: JSON.stringify([kv("X-Root", "1"), kv("X-Shared", "root")]),
      variables_json: JSON.stringify([kv("baseUrl", "https://root.test")]),
      auth_json: JSON.stringify({ type: "bearer", bearer: { token: "root-token" } }),
      auth_type: "bearer",
      scripts_json: JSON.stringify({
        preRequest: "// root pre",
        postResponse: "",
        tests: "// root test",
      }),
    }),
    folder({
      id: "auth",
      name: "Auth",
      parent_id: "root",
      headers_json: JSON.stringify([kv("X-Shared", "auth"), kv("X-Auth", "2")]),
      variables_json: JSON.stringify([kv("baseUrl", "https://auth.test")]),
      auth_json: JSON.stringify({ type: "none" }),
      auth_type: "none",
      scripts_json: JSON.stringify({
        preRequest: "// auth pre",
        postResponse: "// auth post",
        tests: "",
      }),
    }),
  ];

  it("builds root→leaf chain", () => {
    const chain = buildFolderChain("auth", folders);
    expect(chain.map((c) => c.folder.id)).toEqual(["root", "auth"]);
  });

  it("merges headers with child override", () => {
    const chain = buildFolderChain("auth", folders);
    const merged = mergeHeaders(chain, [kv("X-Req", "3"), kv("X-Shared", "req")]);
    const byKey = Object.fromEntries(merged.map((h) => [h.key, h.value]));
    expect(byKey["X-Root"]).toBe("1");
    expect(byKey["X-Auth"]).toBe("2");
    expect(byKey["X-Shared"]).toBe("req");
    expect(byKey["X-Req"]).toBe("3");
  });

  it("resolves inherit auth from nearest ancestor", () => {
    const chain = buildFolderChain("auth", folders);
    expect(resolveInheritedAuth(chain, { type: "inherit" })).toEqual({
      type: "bearer",
      bearer: { token: "root-token" },
    });
    expect(resolveInheritedAuth(chain, { type: "basic", basic: { username: "a", password: "b" } }).type).toBe(
      "basic",
    );
  });

  it("merges folder variables with override", () => {
    const chain = buildFolderChain("auth", folders);
    expect(mergeFolderVariables(chain)).toEqual({
      baseUrl: "https://auth.test",
    });
  });

  it("collects scripts root→leaf", () => {
    const chain = buildFolderChain("auth", folders);
    const scripts = collectFolderScripts(chain);
    expect(scripts.preRequest).toEqual(["// root pre", "// auth pre"]);
    expect(joinScripts(scripts.preRequest)).toContain("// root pre");
    expect(scripts.tests).toEqual(["// root test"]);
  });

  it("extracts json path", () => {
    const body = JSON.stringify({ data: { token: "abc", items: [{ id: 1 }] } });
    expect(extractJsonPath(body, "$.data.token")).toBe("abc");
    expect(extractJsonPath(body, "$.data.items[0].id")).toBe("1");
  });
});
