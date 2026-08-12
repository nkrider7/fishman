import type { editor as MonacoEditor } from "monaco-editor";
import { rememberTextSelection } from "@/url-replace/selection-cache";

type MonacoCodeEditor = MonacoEditor.IStandaloneCodeEditor;

const editors = new Set<MonacoCodeEditor>();

/** Track a Monaco editor for selection-aware shortcuts (Find & Replace, etc.). */
export function registerMonacoEditor(editor: MonacoCodeEditor): () => void {
  editors.add(editor);
  const selSub = editor.onDidChangeCursorSelection(() => {
    try {
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection || selection.isEmpty()) return;
      rememberTextSelection(model.getValueInRange(selection));
    } catch {
      // ignore
    }
  });
  const disposable = editor.onDidDispose(() => {
    editors.delete(editor);
  });
  return () => {
    selSub.dispose();
    disposable.dispose();
    editors.delete(editor);
  };
}

/** Prefer the Monaco editor that currently has text focus. */
export function getFocusedMonacoEditor(): MonacoCodeEditor | null {
  for (const ed of editors) {
    try {
      if (ed.hasTextFocus()) return ed;
    } catch {
      // disposed
    }
  }
  return null;
}

export function getMonacoSelectedText(): string {
  const ed = getFocusedMonacoEditor();
  if (!ed) return "";
  try {
    const model = ed.getModel();
    const selection = ed.getSelection();
    if (!model || !selection || selection.isEmpty()) return "";
    return model.getValueInRange(selection);
  } catch {
    return "";
  }
}
