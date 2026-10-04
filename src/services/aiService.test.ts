import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAiEngineStatus,
  runAiCopilot,
  parseCurlCommand,
  generateSchemaFromJson,
  scanCodebaseWithAi,
  listenAiScanProgress,
} from "./aiService";
import * as tauriCore from "@tauri-apps/api/core";
import * as tauriEvent from "@tauri-apps/api/event";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("aiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAiEngineStatus returns status from IPC", async () => {
    const mockStatus = {
      ready: true,
      modelLoaded: true,
      modelPath: "/resources/needle2.cact",
      engineType: "Needle 2 Native",
      ramUsageMb: 28,
    };
    vi.mocked(tauriCore.invoke).mockResolvedValueOnce(mockStatus);

    const status = await getAiEngineStatus();
    expect(tauriCore.invoke).toHaveBeenCalledWith("ai_get_status");
    expect(status.ready).toBe(true);
    expect(status.ramUsageMb).toBe(28);
  });

  it("getAiEngineStatus handles IPC failure gracefully", async () => {
    vi.mocked(tauriCore.invoke).mockRejectedValueOnce(new Error("IPC failed"));

    const status = await getAiEngineStatus();
    expect(status.ready).toBe(false);
    expect(status.error).toContain("IPC failed");
  });

  it("runAiCopilot invokes ai_run_copilot with prompt and context", async () => {
    const mockResult = {
      toolCall: {
        name: "generate_http_request",
        arguments: { method: "POST", url: "/users" },
      },
      generatedRequest: {
        name: "Create User",
        method: "POST" as const,
        url: "{{base_url}}/api/v1/users",
        headers: [],
        params: [],
        bodyType: "json" as const,
        body: "{}",
      },
      rawOutput: "{}",
      latencyMs: 5,
    };
    vi.mocked(tauriCore.invoke).mockResolvedValueOnce(mockResult);

    const result = await runAiCopilot("Create user POST", {
      environmentNames: ["Dev", "Prod"],
    });
    expect(tauriCore.invoke).toHaveBeenCalledWith("ai_run_copilot", {
      prompt: "Create user POST",
      context: { environmentNames: ["Dev", "Prod"] },
    });
    expect(result.toolCall.name).toBe("generate_http_request");
    expect(result.generatedRequest?.method).toBe("POST");
  });

  it("parseCurlCommand invokes ai_parse_curl", async () => {
    const curl = "curl https://api.io/test";
    const mockRequest = {
      name: "cURL GET https://api.io/test",
      method: "GET" as const,
      url: "https://api.io/test",
      headers: [],
      params: [],
      bodyType: "none" as const,
      body: "",
    };
    vi.mocked(tauriCore.invoke).mockResolvedValueOnce(mockRequest);

    const res = await parseCurlCommand(curl);
    expect(tauriCore.invoke).toHaveBeenCalledWith("ai_parse_curl", { curl });
    expect(res.url).toBe("https://api.io/test");
  });

  it("generateSchemaFromJson invokes ai_generate_schema", async () => {
    const sample = '{"id":1}';
    vi.mocked(tauriCore.invoke).mockResolvedValueOnce("export interface User { id: number; }");

    const res = await generateSchemaFromJson(sample, "typescript", "User");
    expect(tauriCore.invoke).toHaveBeenCalledWith("ai_generate_schema", {
      sampleJson: sample,
      format: "typescript",
      rootName: "User",
    });
    expect(res).toContain("export interface User");
  });

  it("scanCodebaseWithAi invokes ai_scan_codebase", async () => {
    const mockSummary = {
      projectPath: "/my/backend",
      frameworkDetected: "FastAPI",
      filesScanned: 12,
      endpoints: [],
      baseUrl: "http://localhost:8000",
      collectionName: "Backend API",
      durationMs: 45,
    };
    vi.mocked(tauriCore.invoke).mockResolvedValueOnce(mockSummary);

    const res = await scanCodebaseWithAi("/my/backend", {
      baseUrl: "http://localhost:8000",
    });
    expect(tauriCore.invoke).toHaveBeenCalledWith("ai_scan_codebase", {
      path: "/my/backend",
      options: { baseUrl: "http://localhost:8000" },
    });
    expect(res.frameworkDetected).toBe("FastAPI");
  });

  it("listenAiScanProgress registers event listener", async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(tauriEvent.listen).mockResolvedValueOnce(mockUnlisten);

    const cb = vi.fn();
    const unlisten = await listenAiScanProgress(cb);
    expect(tauriEvent.listen).toHaveBeenCalledWith("ai-scan-progress", expect.any(Function));
    expect(unlisten).toBe(mockUnlisten);
  });
});

