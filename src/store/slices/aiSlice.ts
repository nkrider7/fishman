import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AiEngineStatus, AiCopilotResult, AiChatMessage } from "@/types/ai";

export interface AiState {
  isOpen: boolean;
  isSidebarOpen: boolean;
  status: AiEngineStatus | null;
  loading: boolean;
  prompt: string;
  lastResult: AiCopilotResult | null;
  error: string | null;
  history: string[];
  messages: AiChatMessage[];
}

const initialState: AiState = {
  isOpen: false,
  isSidebarOpen: false,
  status: null,
  loading: false,
  prompt: "",
  lastResult: null,
  error: null,
  history: [],
  messages: [],
};

const aiSlice = createSlice({
  name: "ai",
  initialState,
  reducers: {
    setAiOpen: (state, action: PayloadAction<boolean>) => {
      state.isOpen = action.payload;
      if (!action.payload) {
        state.error = null;
      }
    },
    toggleAiOpen: (state) => {
      state.isOpen = !state.isOpen;
      if (!state.isOpen) {
        state.error = null;
      }
    },
    setPrompt: (state, action: PayloadAction<string>) => {
      state.prompt = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    setStatus: (state, action: PayloadAction<AiEngineStatus>) => {
      state.status = action.payload;
    },
    setResult: (state, action: PayloadAction<AiCopilotResult>) => {
      state.lastResult = action.payload;
      state.loading = false;
      state.error = null;
      if (state.prompt && !state.history.includes(state.prompt)) {
        state.history.unshift(state.prompt);
        if (state.history.length > 20) {
          state.history.pop();
        }
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    setAiSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    toggleAiSidebarOpen: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    addChatMessage: (state, action: PayloadAction<AiChatMessage>) => {
      state.messages.push(action.payload);
      if (state.messages.length > 50) {
        state.messages.shift();
      }
    },
    clearChatMessages: (state) => {
      state.messages = [];
    },
    clearResult: (state) => {
      state.lastResult = null;
      state.error = null;
      state.prompt = "";
    },
  },
});

export const {
  setAiOpen,
  toggleAiOpen,
  setAiSidebarOpen,
  toggleAiSidebarOpen,
  addChatMessage,
  clearChatMessages,
  setPrompt,
  setLoading,
  setStatus,
  setResult,
  setError,
  clearResult,
} = aiSlice.actions;

export default aiSlice.reducer;
