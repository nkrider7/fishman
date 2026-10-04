import { describe, expect, it } from "vitest";
import {
  buildNetworkLogEntry,
  buildNetworkTrace,
  capNetworkBody,
  snapshotRequestBody,
  snapshotRequestHeaders,
} from "./networkLog";

describe("snapshotRequestHeaders", () => {
  it("keeps enabled headers only", () => {
    expect(
      snapshotRequestHeaders([
        { id: "1", key: "Accept", value: "application/json", enabled: true },
        { id: "2", key: "X-Test", value: "off", enabled: false },
      ]),
    ).toEqual({ Accept: "application/json" });
  });
});

describe("snapshotRequestBody", () => {
  it("returns null for none body type", () => {
    expect(snapshotRequestBody({ bodyType: "none", body: "" })).toBeNull();
  });

  it("describes multipart fields", () => {
    const body = snapshotRequestBody({
      bodyType: "form-data",
      body: "",
      formDataFields: [
        {
          id: "1",
          key: "file",
          type: "file",
          value: "",
          filePaths: ["/tmp/a.png"],
          enabled: true,
        },
      ],
    });
    expect(body).toContain("[multipart/form-data]");
    expect(body).toContain("file: [file: /tmp/a.png]");
  });
});

describe("capNetworkBody", () => {
  it("truncates large bodies", () => {
    const large = "x".repeat(300_000);
    const result = capNetworkBody(large);
    expect(result.truncated).toBe(true);
    expect(result.body).toContain("[truncated for network log]");
  });
});

describe("buildNetworkTrace", () => {
  it("includes error lines on failure", () => {
    const trace = buildNetworkTrace({
      startedAt: Date.UTC(2026, 7, 23, 12, 0, 0, 0),
      method: "GET",
      url: "https://example.com/api",
      error: "Connection refused",
    });
    expect(trace.some((line) => line.level === "error")).toBe(true);
    expect(trace.some((line) => line.message.includes("Connection refused"))).toBe(
      true,
    );
  });

  it("includes success response summary", () => {
    const trace = buildNetworkTrace({
      startedAt: Date.UTC(2026, 7, 23, 12, 0, 0, 0),
      method: "GET",
      url: "https://example.com/api",
      statusCode: 200,
      statusText: "OK",
      durationMs: 120,
      sizeBytes: 512,
    });
    expect(trace.some((line) => line.message.includes("Response: 200 OK"))).toBe(
      true,
    );
  });
});

describe("buildNetworkLogEntry", () => {
  it("builds a complete entry with trace", () => {
    const entry = buildNetworkLogEntry({
      method: "POST",
      url: "https://api.example.com/users",
      statusCode: 201,
      statusText: "Created",
      durationMs: 88,
      sizeBytes: 42,
      requestHeaders: { "Content-Type": "application/json" },
      responseHeaders: { "content-type": "application/json" },
      responseBody: '{"id":1}',
    });

    expect(entry.domain).toBe("api.example.com");
    expect(entry.path).toBe("/users");
    expect(entry.trace?.length).toBeGreaterThan(0);
    expect(entry.requestHeaders?.["Content-Type"]).toBe("application/json");
    expect(entry.responseBody).toBe('{"id":1}');
  });
});
