/**
 * Keeps the last non-empty text selection so Ctrl+Shift+H still works
 * even if the shortcut briefly clears focus/selection.
 */
import { getActiveTextSelection } from "./get-selection-text";

let lastSelection = "";

export function rememberTextSelection(raw: string): void {
  if (raw.trim()) lastSelection = raw;
}

export function getRememberedSelection(): string {
  return lastSelection;
}

export function clearRememberedSelection(): void {
  lastSelection = "";
}

/** Capture selection from the live caret, falling back to the last remembered text. */
export function getSelectionForUrlReplace(): string {
  const live = getActiveTextSelection();
  if (live.trim()) {
    lastSelection = live;
    return live;
  }
  return lastSelection;
}

export function installSelectionTracker(): () => void {
  const capture = () => {
    const live = getActiveTextSelection();
    if (live.trim()) lastSelection = live;
  };

  document.addEventListener("selectionchange", capture);
  document.addEventListener("mouseup", capture, true);
  document.addEventListener("keyup", capture, true);
  return () => {
    document.removeEventListener("selectionchange", capture);
    document.removeEventListener("mouseup", capture, true);
    document.removeEventListener("keyup", capture, true);
  };
}
