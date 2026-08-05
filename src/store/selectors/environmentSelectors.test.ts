import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { selectActiveEnvironmentContext } from "./environmentSelectors";
import type { RootState } from "../index";
import environmentReducer from "../slices/environmentSlice";
import collectionsReducer from "../slices/collectionsSlice";
import uiReducer from "../slices/uiSlice";

function minimalStore() {
  return configureStore({
    reducer: {
      environments: environmentReducer,
      collections: collectionsReducer,
      ui: uiReducer,
    },
  });
}

describe("selectActiveEnvironmentContext", () => {
  it("returns a stable reference when unrelated state changes", () => {
    const store = minimalStore();
    const state1 = store.getState() as unknown as RootState;
    const first = selectActiveEnvironmentContext(state1, null);

    store.dispatch({ type: "ui/setEnvironmentManagerOpen", payload: true });
    const state2 = store.getState() as unknown as RootState;
    const second = selectActiveEnvironmentContext(state2, null);

    expect(second).toBe(first);
  });

  it("caches distinct collectionIds independently", () => {
    const store = minimalStore();
    const state = store.getState() as unknown as RootState;
    const a = selectActiveEnvironmentContext(state, "col-a");
    const b = selectActiveEnvironmentContext(state, "col-b");
    const aAgain = selectActiveEnvironmentContext(state, "col-a");

    expect(a).not.toBe(b);
    expect(aAgain).toBe(a);
  });
});
