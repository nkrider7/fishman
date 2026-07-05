import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SidebarView = "collections" | "history" | "settings";

interface UiState {
  sidebarView: SidebarView;
  commandPaletteOpen: boolean;
  responsePanelVisible: boolean;
  environmentManagerOpen: boolean;
}

const initialState: UiState = {
  sidebarView: "collections",
  commandPaletteOpen: false,
  responsePanelVisible: true,
  environmentManagerOpen: false,
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
  },
});

export const {
  setSidebarView,
  setCommandPaletteOpen,
  setResponsePanelVisible,
  setEnvironmentManagerOpen,
} = uiSlice.actions;
export default uiSlice.reducer;
