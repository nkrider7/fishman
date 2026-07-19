import { describe, expect, it } from "vitest";
import { validateScript } from "@/script-engine/parser";
import { resolveDynamicVariablesIn } from "@/script-engine/builtins";
import { replaceVariablesIn, createEmptyVariableMap } from "@/script-engine/variables";
import { createExpect, createResponseExpect } from "@/script-engine/assertions";

describe("validateScript", () => {
  it("rejects forbidden identifiers", () => {
    const result = validateScript('const x = process.env.NODE_ENV;');
    expect(result.valid).toBe(false);
    expect(result.error?.message).toContain("process");
  });

  it("allows valid script", () => {
    const result = validateScript(`
      fm.test("ok", () => {
        fm.response.to.have.status(200);
      });
    `);
    expect(result.valid).toBe(true);
  });
});

describe("dynamic variables", () => {
  it("resolves $uuid", () => {
    const result = resolveDynamicVariablesIn("id={{ $uuid }}");
    expect(result).not.toContain("{{ $uuid }}");
  });
});

describe("variable scopes", () => {
  it("replaces variables by priority", () => {
    const vars = createEmptyVariableMap();
    vars.global.token = "global";
    vars.environment.token = "env";
    expect(replaceVariablesIn("{{token}}", vars)).toBe("env");
  });
});

describe("expectations", () => {
  it("passes equal assertion", () => {
    expect(() => createExpect(200).to.equal(200)).not.toThrow();
  });

  it("fails status assertion", () => {
    expect(() =>
      createResponseExpect({
        status: 404,
        statusText: "Not Found",
        headers: {},
        body: "",
        size: 0,
        time: 10,
      }).to.have.status(200),
    ).toThrow();
  });
});
