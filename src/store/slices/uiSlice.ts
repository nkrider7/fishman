import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SidebarView =
  | "collections"
  | "history"
  | "settings"
  | "url-replace";

export type ToolsPanelTab =
  | "console"
  | "network"
  | "performance"
  | "terminal";

export interface UrlReplaceUiScope {
  kind: "collection" | "folder" | "selected" | "workspace" | "open-tabs";
  folderId?: string | null;
  requestIds?: string[];
}

interface UiState {
  sidebarView: SidebarView;
  commandPaletteOpen: boolean;
  responsePanelVisible: boolean;
  environmentManagerOpen: boolean;
  cookiesManagerOpen: boolean;
  apiTestingOpen: boolean;
  /** Optional scope seed when opening Find & Replace URLs. */
  urlReplaceScope: UrlReplaceUiScope | null;
  /** Prefill find string (selection / scanner). */
  urlReplaceFindPrefill: string | null;
  /** Bumps when a new prefill is applied so the panel can re-sync. */
  urlReplacePrefillSeq: number;
  /** Bottom tools panel open state (StatusBar Console toggles this). */
  scriptConsoleVisible: boolean;
  toolsPanelTab: ToolsPanelTab;
  /** True when the main window is in fullscreen (not the same as maximized). */
  fullscreen: boolean;
}

const initialState: UiState = {
  sidebarView: "collections",
  commandPaletteOpen: false,
  responsePanelVisible: true,
  environmentManagerOpen: false,
  cookiesManagerOpen: false,
  apiTestingOpen: false,
  urlReplaceScope: null,
  urlReplaceFindPrefill: null,
  urlReplacePrefillSeq: 0,
  scriptConsoleVisible: false,
  toolsPanelTab: "console",
  fullscreen: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setSidebarView: (state, action: PayloadAction<SidebarView>) => {
      state.sidebarView = action.payload;
    },
    setCommandPaletteOpen: (state, action: PayloadAction<boolean>) => {
      state.commandPaletteOpen = action.payload;
    },
    setResponsePanelVisible: (state, action: PayloadAction<boolean>) => {
      state.responsePanelVisible = action.payload;
    },
    setEnvironmentManagerOpen: (state, action: PayloadAction<boolean>) => {
      state.environmentManagerOpen = action.payload;
    },
    setCookiesManagerOpen: (state, action: PayloadAction<boolean>) => {
      state.cookiesManagerOpen = action.payload;
    },
    setApiTestingOpen: (state, action: PayloadAction<boolean>) => {
      state.apiTestingOpen = action.payload;
    },
    openUrlReplace: (
      state,
      action: PayloadAction<
        | {
            scope?: UrlReplaceUiScope | null;
            findPrefill?: string | null;
          }
        | undefined
      >,
    ) => {
      state.sidebarView = "url-replace";
      if (action.payload?.scope !== undefined) {
        state.urlReplaceScope = action.payload.scope;
      }
      if (action.payload?.findPrefill != null && action.payload.findPrefill !== "") {
        state.urlReplaceFindPrefill = action.payload.findPrefill;
        state.urlReplacePrefillSeq += 1;
      } else if (action.payload?.findPrefill === null) {
        // explicit clear
        state.urlReplaceFindPrefill = null;
      }
    },
    clearUrlReplacePrefill: (state) => {
      state.urlReplaceFindPrefill = null;
    },
    setScriptConsoleVisible: (state, action: PayloadAction<boolean>) => {
      state.scriptConsoleVisible = action.payload;
    },
    toggleScriptConsole: (state) => {
      state.scriptConsoleVisible = !state.scriptConsoleVisible;
    },
    setToolsPanelTab: (state, action: PayloadAction<ToolsPanelTab>) => {
      state.toolsPanelTab = action.payload;
    },
    setFullscreen: (state, action: PayloadAction<boolean>) => {
      state.fullscreen = action.payload;
    },
  },
});

export const {
  setSidebarView,
  setCommandPaletteOpen,
  setResponsePanelVisible,
  setEnvironmentManagerOpen,
  setCookiesManagerOpen,
  setApiTestingOpen,
  openUrlReplace,
  clearUrlReplacePrefill,
  setScriptConsoleVisible,
  toggleScriptConsole,
  setToolsPanelTab,
  setFullscreen,
} = uiSlice.actions;
export default uiSlice.reducer;
