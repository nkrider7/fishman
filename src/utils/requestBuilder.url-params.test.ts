import { describe, expect, it } from "vitest";
import {
  buildUrlWithParams,
  syncParamsFromUrl,
  syncUrlWithParams,
} from "./requestBuilder";
import type { KeyValue } from "@/types/request";

const kv = (
  key: string,
  value: string,
  enabled = true,
  id = crypto.randomUUID(),
): KeyValue => ({ id, key, value, enabled });

describe("buildUrlWithParams", () => {
  it("appends enabled params and strips an existing query", () => {
    const url = buildUrlWithParams("https://api.example.com/search?old=1", [
      kv("q", "fish"),
      kv("page", "2"),
      kv("skip", "x", false),
    ]);
    expect(url).toBe("https://api.example.com/search?q=fish&page=2");
  });

  it("preserves hash and template variables in the base", () => {
    const url = buildUrlWithParams("{{baseUrl}}/users#top", [
      kv("id", "{{userId}}"),
    ]);
    expect(url).toBe("{{baseUrl}}/users?id=%7B%7BuserId%7D%7D#top");
  });

  it("fully encodes on send after substitution-style values", () => {
    const url = buildUrlWithParams("http://google.com", [
      kv("Helloworl", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(url).toBe(
      "http://google.com?Helloworl=2026-01-01T00%3A00%3A00.000Z",
    );
  });

  it("returns base+hash when no enabled params", () => {
    expect(buildUrlWithParams("https://x.test?a=1#h", [])).toBe(
      "https://x.test#h",
    );
  });
});

describe("syncUrlWithParams / syncParamsFromUrl", () => {
  it("keeps {{variables}} readable in the URL bar", () => {
    expect(
      syncUrlWithParams("http://google.com", [
        kv("Helloworl", "{{$isoTimestamp}}"),
      ]),
    ).toBe("http://google.com?Helloworl={{$isoTimestamp}}");
  });

  it("parses URL query into params, reusing previous ids", () => {
    const previous = [kv("asds", "old", true, "row-1")];
    const next = syncParamsFromUrl("http://google.com?asds=new&b=2", previous);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "row-1", key: "asds", value: "new" });
    expect(next[1]).toMatchObject({ key: "b", value: "2", enabled: true });
  });

  it("round-trips params through the URL", () => {
    const params = [kv("a", "1"), kv("b", "{{x}}")];
    const url = syncUrlWithParams("https://api.test/path", params);
    const back = syncParamsFromUrl(url, params);
    expect(back.map((p) => ({ key: p.key, value: p.value }))).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "{{x}}" },
    ]);
  });
});
