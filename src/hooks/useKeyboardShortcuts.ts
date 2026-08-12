import { useEffect } from "react";
import { useAppDispatch } from "@/hooks/redux";
import { store } from "@/store";
import { sendRequestThunk } from "@/store/thunks/sendRequest";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
import { saveFolderSettings } from "@/store/thunks/collectionSettingsThunks";
import { closeTab, setActiveTab, updateTab } from "@/store/slices/tabsSlice";
import { removeDraft, updateDraft } from "@/store/slices/requestSlice";
import { clearResponse } from "@/store/slices/responseSlice";
import { clearScriptExecution } from "@/store/slices/scriptExecutionSlice";
import { closeRunnerSession } from "@/store/slices/runnerSlice";
import { closeSettingsDraft } from "@/store/slices/collectionSettingsSlice";
import {
  setScriptConsoleVisible,
  setToolsPanelTab,
} from "@/store/slices/uiSlice";
import { openUrlReplacePanel } from "@/store/thunks/openUrlReplacePanel";
import { createEmptyRequest, isWebSocketRequest } from "@/types/request";
import { tryFormatJson } from "@/utils/requestBuilder";
import {
  selectionToFindPrefill,
} from "@/url-replace/get-selection-text";
import {
  getSelectionForUrlReplace,
  installSelectionTracker,
} from "@/url-replace/selection-cache";
import {
  cleanupWebSocketTabThunk,
  connectWebSocketThunk,
  disconnectWebSocketThunk,
} from "@/store/thunks/websocketThunks";

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Global shortcuts. Reads live state via store.getState() so the capture
 * listener is registered once — previously it tore down/rebound on every
 * draft keystroke because `draft` was in the effect deps.
 */
export function useKeyboardShortcuts() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    return installSelectionTracker();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = store.getState();
      const tabs = state.tabs.tabs;
      const activeTabId = state.tabs.activeTabId;
      const activeTab = tabs.find((t) => t.id === activeTabId);
      const draft = activeTabId ? state.request.drafts[activeTabId] : null;
      const wsStatus = activeTabId
        ? state.websocket.byTab[activeTabId]?.status
        : undefined;
      const settingsDirty = state.collectionSettings.draft?.dirty ?? false;
      const settingsTabId = state.collectionSettings.draft?.tabId;
      const runnerTabId = state.runner.tabId;
      const scriptConsoleVisible = state.ui.scriptConsoleVisible;
      const toolsPanelTab = state.ui.toolsPanelTab;

      // Ctrl+` / Cmd+` — toggle integrated terminal (VS Code-style).
      if (
        e.key === "`" &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (scriptConsoleVisible && toolsPanelTab === "terminal") {
          dispatch(setScriptConsoleVisible(false));
        } else {
          dispatch(setToolsPanelTab("terminal"));
          dispatch(setScriptConsoleVisible(true));
        }
        return;
      }

      // Ctrl/Cmd+Shift+H — Find & Replace URLs (sidebar, VS Code–style).
      // Capture selection BEFORE preventDefault / focus changes.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === "h" || e.key === "H")
      ) {
        const findPrefill = selectionToFindPrefill(getSelectionForUrlReplace());
        e.preventDefault();
        e.stopPropagation();
        void dispatch(
          openUrlReplacePanel(
            findPrefill ? { findPrefill } : undefined,
          ),
        );
        return;
      }

      // Shift+Alt+F — beautify JSON body
      if (
        e.altKey &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === "f" || e.key === "F") &&
        activeTabId &&
        draft &&
        (!activeTab?.kind || activeTab.kind === "request") &&
        draft.bodyType === "json" &&
        !isWebSocketRequest(draft)
      ) {
        e.preventDefault();
        e.stopPropagation();
        const formatted = tryFormatJson(draft.body);
        if (formatted !== draft.body) {
          dispatch(
            updateDraft({ tabId: activeTabId, changes: { body: formatted } }),
          );
          dispatch(updateTab({ id: activeTabId, changes: { unsaved: true } }));
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (any tab kind).
      if (e.key === "Tab" && tabs.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const nextIdx = e.shiftKey
          ? idx <= 0
            ? tabs.length - 1
            : idx - 1
          : idx < 0 || idx >= tabs.length - 1
            ? 0
            : idx + 1;
        const next = tabs[nextIdx];
        if (next) dispatch(setActiveTab(next.id));
        return;
      }

      if (activeTab?.kind === "runner") {
        if ((e.key === "w" || e.key === "W") && activeTabId) {
          if (isFormFieldTarget(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          if (activeTabId === runnerTabId) dispatch(closeRunnerSession());
          dispatch(closeTab(activeTabId));
        }
        return;
      }

      if (activeTab?.kind === "git") {
        if ((e.key === "w" || e.key === "W") && activeTabId) {
          if (isFormFieldTarget(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          dispatch(closeTab(activeTabId));
        }
        return;
      }

      if (activeTab?.kind === "collection") {
        if ((e.key === "s" || e.key === "S") && settingsDirty) {
          e.preventDefault();
          e.stopPropagation();
          void dispatch(saveFolderSettings());
          return;
        }
        if ((e.key === "w" || e.key === "W") && activeTabId) {
          if (isFormFieldTarget(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          if (activeTabId === settingsTabId) dispatch(closeSettingsDraft());
          dispatch(closeTab(activeTabId));
          return;
        }
        return;
      }

      if (e.key === "Enter" && activeTabId) {
        e.preventDefault();
        e.stopPropagation();
        if (draft && isWebSocketRequest(draft)) {
          if (wsStatus === "open" || wsStatus === "connecting") {
            void dispatch(disconnectWebSocketThunk(activeTabId));
          } else {
            void dispatch(connectWebSocketThunk(activeTabId));
          }
          return;
        }
        dispatch(sendRequestThunk(activeTabId));
        return;
      }

      if ((e.key === "s" || e.key === "S") && activeTabId && draft) {
        e.preventDefault();
        e.stopPropagation();
        void dispatch(saveActiveTab(activeTabId));
        return;
      }

      if ((e.key === "w" || e.key === "W") && activeTabId) {
        if (isFormFieldTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        void dispatch(cleanupWebSocketTabThunk(activeTabId));
        dispatch(closeTab(activeTabId));
        dispatch(removeDraft(activeTabId));
        dispatch(clearResponse(activeTabId));
        dispatch(clearScriptExecution(activeTabId));
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        e.stopPropagation();
        dispatch(
          openRequestTab({ request: createEmptyRequest(), forceNew: true }),
        );
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [dispatch]);
}
