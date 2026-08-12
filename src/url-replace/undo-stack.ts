import type { UrlReplaceUndoEntry } from "./types";

const MAX_UNDO = 20;

let stack: UrlReplaceUndoEntry[] = [];

export function pushUndo(entry: UrlReplaceUndoEntry): void {
  stack.push(entry);
  if (stack.length > MAX_UNDO) {
    stack = stack.slice(stack.length - MAX_UNDO);
  }
}

export function popUndo(): UrlReplaceUndoEntry | null {
  return stack.pop() ?? null;
}

export function peekUndo(): UrlReplaceUndoEntry | null {
  return stack.length > 0 ? stack[stack.length - 1]! : null;
}

export function clearUndo(): void {
  stack = [];
}

export function undoDepth(): number {
  return stack.length;
}

/** Test helper */
export function __resetUndoForTests(): void {
  stack = [];
}
