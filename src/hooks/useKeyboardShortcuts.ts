import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { sendRequestThunk } from "@/store";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
import { closeTab } from "@/store/slices/tabsSlice";
import { createEmptyRequest } from "@/types/request";

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useKeyboardShortcuts() {
  const dispatch = useAppDispatch();
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const draft = useAppSelector((s) =>
    activeTabId ? s.request.drafts[activeTabId] : null,
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "Enter" && activeTabId) {
        e.preventDefault();
        e.stopPropagation();
        dispatch(sendRequestThunk(activeTabId));
        return;
      }

      if ((e.key === "s" || e.key === "S") && activeTabId && draft) {
        e.preventDefault();
        e.stopPropagation();
        dispatch(saveActiveTab(activeTabId));
        return;
      }

      if ((e.key === "w" || e.key === "W") && activeTabId) {
        if (isFormFieldTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        dispatch(closeTab(activeTabId));
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        e.stopPropagation();
        dispatch(openRequestTab({ request: createEmptyRequest(), forceNew: true }));
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [dispatch, activeTabId, draft]);
}
