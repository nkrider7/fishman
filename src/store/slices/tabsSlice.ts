import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Tab } from "@/types/request";
import { generateId } from "@/utils/id";

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

const initialTabId = generateId();
const initialState: TabsState = {
  tabs: [
    {
      id: initialTabId,
      title: "Untitled Request",
      unsaved: false,
      pinned: false,
    },
  ],
  activeTabId: initialTabId,
};

export const initialRequestTabId = initialTabId;

const tabsSlice = createSlice({
  name: "tabs",
  initialState,
  reducers: {
    addTab: (
      state,
      action: PayloadAction<{
        id?: string;
        requestId?: string;
        title?: string;
      } | undefined>,
    ) => {
      const id = action.payload?.id ?? generateId();
      const tab: Tab = {
        id,
        title: action.payload?.title ?? "Untitled Request",
        requestId: action.payload?.requestId,
        unsaved: false,
        pinned: false,
      };
      state.tabs.push(tab);
      state.activeTabId = id;
    },
    closeTab: (state, action: PayloadAction<string>) => {
      const index = state.tabs.findIndex((t) => t.id === action.payload);
      if (index === -1) return;
      state.tabs.splice(index, 1);
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs[Math.max(0, index - 1)]?.id ?? null;
      }
      if (state.tabs.length === 0) {
        const id = generateId();
        state.tabs.push({
          id,
          title: "Untitled Request",
          unsaved: false,
          pinned: false,
        });
        state.activeTabId = id;
      }
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTabId = action.payload;
    },
    updateTab: (
      state,
      action: PayloadAction<{ id: string; changes: Partial<Tab> }>,
    ) => {
      const tab = state.tabs.find((t) => t.id === action.payload.id);
      if (tab) Object.assign(tab, action.payload.changes);
    },
    pinTab: (state, action: PayloadAction<string>) => {
      const tab = state.tabs.find((t) => t.id === action.payload);
      if (tab) tab.pinned = !tab.pinned;
    },
    reorderTabs: (state, action: PayloadAction<Tab[]>) => {
      state.tabs = action.payload;
    },
    restoreTabs: (
      state,
      action: PayloadAction<{ tabs: Tab[]; activeTabId: string | null }>,
    ) => {
      if (action.payload.tabs.length > 0) {
        state.tabs = action.payload.tabs;
        state.activeTabId = action.payload.activeTabId;
      }
    },
  },
});

export const {
  addTab,
  closeTab,
  setActiveTab,
  updateTab,
  pinTab,
  reorderTabs,
  restoreTabs,
} = tabsSlice.actions;
export default tabsSlice.reducer;
