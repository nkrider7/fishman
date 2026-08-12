import { extractOrigin } from "./replace-urls";
import { getMonacoSelectedText } from "@/monaco/editor-registry";

const MAX_PREFILL_LEN = 500;

/**
 * Read the current text selection from:
 * - focused <input> / <textarea> (URL bar, form fields)
 * - focused Monaco editor (body / GraphQL / scripts)
 * - window selection (fallback)
 */
export function getActiveTextSelection(): string {
  const el = document.activeElement;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      end > start
    ) {
      return el.value.slice(start, end);
    }
  }

  const monacoSel = getMonacoSelectedText();
  if (monacoSel) return monacoSel;

  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    return sel.toString();
  }

  return "";
}

/**
 * Turn a raw selection into a sensible Find prefill for URL replace.
 * Full URLs collapse to origin (scheme://host[:port]); other text is kept as-is.
 */
export function selectionToFindPrefill(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_PREFILL_LEN) {
    return trimmed.slice(0, MAX_PREFILL_LEN);
  }

  // Selected a full URL (possibly with path) → use origin for bulk host replace
  const origin = extractOrigin(trimmed);
  if (origin) return origin;

  // Bare origin-like string already, or path/host fragment for literal mode
  return trimmed;
}
