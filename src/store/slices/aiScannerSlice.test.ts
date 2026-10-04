import { describe, it, expect } from "vitest";
import aiScannerReducer, {
  openAiScanner,
  closeAiScanner,
  setAiScannerStep,
  setAiScannerCollectionName,
  setAiScannerBaseUrl,
  setAiScannerGenerateMocks,
  setAiScannerDetectAuth,
  setAiScannerCreateEnvironment,
  setSelectedEndpointIds,
  toggleEndpointSelection,
  selectAllEndpoints,
  deselectAllEndpoints,
  setActiveMethodFilter,
  setSearchQuery,
  setSelectedPreviewEndpointId,
} from "./aiScannerSlice";
import type { AiScannedEndpoint } from "@/types/ai";

describe("aiScannerSlice", () => {
  const initial = aiScannerReducer(undefined, { type: "@@INIT" });

  it("has correct initial state", () => {
    expect(initial.open).toBe(false);
    expect(initial.step).toBe("select");
    expect(initial.generateMocks).toBe(true);
    expect(initial.detectAuth).toBe(true);
    expect(initial.createEnvironment).toBe(true);
    expect(initial.endpoints).toEqual([]);
    expect(initial.activeMethodFilter).toBe("ALL");
  });

  it("handles openAiScanner and closeAiScanner", () => {
    const opened = aiScannerReducer(
      initial,
      openAiScanner({
        projectPath: "/home/user/code/my-fastapi-service",
        collectionName: "Custom API",
      }),
    );
    expect(opened.open).toBe(true);
    expect(opened.step).toBe("select");
    expect(opened.projectPath).toBe("/home/user/code/my-fastapi-service");
    expect(opened.collectionName).toBe("Custom API");

    const closed = aiScannerReducer(opened, closeAiScanner());
    expect(closed.open).toBe(false);
  });

  it("handles toggling endpoint selection and selectAll/deselectAll", () => {
    const mockEndpoints: AiScannedEndpoint[] = [
      {
        id: "ep-1",
        name: "Get Users",
        method: "GET",
        path: "/api/users",
        folder: ["Users"],
        headers: [],
        params: [],
        bodyType: "none",
        body: "",
        sourceFile: "users.py",
        framework: "FastAPI",
        requiresAuth: true,
      },
      {
        id: "ep-2",
        name: "Create User",
        method: "POST",
        path: "/api/users",
        folder: ["Users"],
        headers: [],
        params: [],
        bodyType: "json",
        body: '{"name":"Alice"}',
        sourceFile: "users.py",
        framework: "FastAPI",
        requiresAuth: true,
      },
    ];

    let state = {
      ...initial,
      endpoints: mockEndpoints,
      selectedEndpointIds: ["ep-1"],
    };

    // Toggle ep-2 on
    state = aiScannerReducer(state, toggleEndpointSelection("ep-2"));
    expect(state.selectedEndpointIds).toEqual(["ep-1", "ep-2"]);

    // Toggle ep-1 off
    state = aiScannerReducer(state, toggleEndpointSelection("ep-1"));
    expect(state.selectedEndpointIds).toEqual(["ep-2"]);

    // Select all
    state = aiScannerReducer(state, selectAllEndpoints());
    expect(state.selectedEndpointIds).toEqual(["ep-1", "ep-2"]);

    // Deselect all
    state = aiScannerReducer(state, deselectAllEndpoints());
    expect(state.selectedEndpointIds).toEqual([]);
  });

  it("handles filter changes and search queries", () => {
    let state = aiScannerReducer(initial, setActiveMethodFilter("POST"));
    expect(state.activeMethodFilter).toBe("POST");

    state = aiScannerReducer(state, setSearchQuery("checkout"));
    expect(state.searchQuery).toBe("checkout");

    state = aiScannerReducer(state, setSelectedPreviewEndpointId("ep-123"));
    expect(state.selectedPreviewEndpointId).toBe("ep-123");
  });

  it("handles settings changes", () => {
    let state = aiScannerReducer(initial, setAiScannerCollectionName("My Cool API"));
    expect(state.collectionName).toBe("My Cool API");

    state = aiScannerReducer(state, setAiScannerBaseUrl("http://localhost:8080"));
    expect(state.baseUrl).toBe("http://localhost:8080");

    state = aiScannerReducer(state, setAiScannerGenerateMocks(false));
    expect(state.generateMocks).toBe(false);

    state = aiScannerReducer(state, setAiScannerDetectAuth(false));
    expect(state.detectAuth).toBe(false);

    state = aiScannerReducer(state, setAiScannerCreateEnvironment(false));
    expect(state.createEnvironment).toBe(false);

    state = aiScannerReducer(state, setAiScannerStep("review"));
    expect(state.step).toBe("review");
  });
});

