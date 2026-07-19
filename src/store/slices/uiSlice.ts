import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SidebarView = "collections" | "history" | "settings";

export type ToolsPanelTab =
  | "console"
  | "network"
  | "performance"
  | "terminal";

interface UiState {
  sidebarView: SidebarView;
  commandPaletteOpen: boolean;
  responsePanelVisible: boolean;
  environmentManagerOpen: boolean;
  cookiesManagerOpen: boolean;
  apiTestingOpen: boolean;
  /** Bottom tools panel open state (StatusBar Console toggles this). */
  scriptConsoleVisible: boolean;
  toolsPanelTab: ToolsPanelTab;
}

const initialState: UiState = {
  sidebarView: "collections",
  commandPaletteOpen: false,
  responsePanelVisible: true,
  environmentManagerOpen: false,
  cookiesManagerOpen: false,
  apiTestingOpen: false,
  scriptConsoleVisible: false,
  toolsPanelTab: "console",
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
    setScriptConsoleVisible: (state, action: PayloadAction<boolean>) => {
      state.scriptConsoleVisible = action.payload;
    },
    toggleScriptConsole: (state) => {
      state.scriptConsoleVisible = !state.scriptConsoleVisible;
    },
    setToolsPanelTab: (state, action: PayloadAction<ToolsPanelTab>) => {
      state.toolsPanelTab = action.payload;
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
  setScriptConsoleVisible,
  toggleScriptConsole,
  setToolsPanelTab,
} = uiSlice.actions;
export default uiSlice.reducer;
