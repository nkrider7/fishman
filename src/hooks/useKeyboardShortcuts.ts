import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
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
import { createEmptyRequest } from "@/types/request";
import { tryFormatJson } from "@/utils/requestBuilder";

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useKeyboardShortcuts() {
  const dispatch = useAppDispatch();
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const activeTab = useAppSelector((s) =>
    s.tabs.tabs.find((t) => t.id === s.tabs.activeTabId),
  );
  const draft = useAppSelector((s) =>
    activeTabId ? s.request.drafts[activeTabId] : null,
  );
  const settingsDirty = useAppSelector(
    (s) => s.collectionSettings.draft?.dirty ?? false,
  );
  const settingsTabId = useAppSelector((s) => s.collectionSettings.draft?.tabId);
  const runnerTabId = useAppSelector((s) => s.runner.tabId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        draft.bodyType === "json"
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
  }, [
    dispatch,
    tabs,
    activeTabId,
    draft,
    activeTab?.kind,
    settingsDirty,
    settingsTabId,
    runnerTabId,
  ]);
}
