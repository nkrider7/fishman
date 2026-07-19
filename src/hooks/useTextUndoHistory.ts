import { useCallback, useEffect, useRef } from "react";

const DEFAULT_LIMIT = 100;
const DEFAULT_COALESCE_MS = 400;

interface UseTextUndoHistoryOptions {
  value: string;
  onChange: (value: string) => void;
  enabled?: boolean;
  limit?: number;
  /** Merge rapid keystrokes into one undo step. */
  coalesceMs?: number;
}

interface UseTextUndoHistoryResult {
  /** Wrap user edits so they enter the undo stack. */
  pushChange: (next: string) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * Undo/redo for controlled text inputs (browser native undo breaks under React).
 */
export function useTextUndoHistory({
  value,
  onChange,
  enabled = true,
  limit = DEFAULT_LIMIT,
  coalesceMs = DEFAULT_COALESCE_MS,
}: UseTextUndoHistoryOptions): UseTextUndoHistoryResult {
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const lastEmittedRef = useRef(value);
  const applyingHistoryRef = useRef(false);
  const coalesceBaseRef = useRef<string | null>(null);
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      lastEmittedRef.current = value;
      return;
    }

    // External value change (e.g. URL synced from params) — record undo point.
    if (value !== lastEmittedRef.current) {
      if (coalesceTimerRef.current) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
        coalesceBaseRef.current = null;
      }
      undoStackRef.current.push(lastEmittedRef.current);
      if (undoStackRef.current.length > limit) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      lastEmittedRef.current = value;
    }
  }, [value, enabled, limit]);

  useEffect(() => {
    return () => {
      if (coalesceTimerRef.current) clearTimeout(coalesceTimerRef.current);
    };
  }, []);

  const commitCoalescedBase = useCallback(() => {
    const base = coalesceBaseRef.current;
    coalesceBaseRef.current = null;
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    if (base === null) return;
    if (base === lastEmittedRef.current) return;
    undoStackRef.current.push(base);
    if (undoStackRef.current.length > limit) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, [limit]);

  const pushChange = useCallback(
    (next: string) => {
      if (!enabled) {
        onChange(next);
        return;
      }
      if (next === value) return;

      if (coalesceBaseRef.current === null) {
        coalesceBaseRef.current = value;
      }
      if (coalesceTimerRef.current) clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = setTimeout(() => {
        commitCoalescedBase();
      }, coalesceMs);

      lastEmittedRef.current = next;
      onChange(next);
    },
    [enabled, onChange, value, coalesceMs, commitCoalescedBase],
  );

  const undo = useCallback((): boolean => {
    if (!enabled) return false;
    commitCoalescedBase();
    // After coalesce, last edit may still be "open" as lastEmitted without base.
    // Current value is the top of history we're undoing from.
    if (undoStackRef.current.length === 0) return false;

    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(value);
    applyingHistoryRef.current = true;
    lastEmittedRef.current = prev;
    onChange(prev);
    return true;
  }, [enabled, commitCoalescedBase, value, onChange]);

  const redo = useCallback((): boolean => {
    if (!enabled) return false;
    commitCoalescedBase();
    if (redoStackRef.current.length === 0) return false;

    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(value);
    applyingHistoryRef.current = true;
    lastEmittedRef.current = next;
    onChange(next);
    return true;
  }, [enabled, commitCoalescedBase, value, onChange]);

  const canUndo = useCallback(
    () => enabled && undoStackRef.current.length > 0,
    [enabled],
  );
  const canRedo = useCallback(
    () => enabled && redoStackRef.current.length > 0,
    [enabled],
  );

  return { pushChange, undo, redo, canUndo, canRedo };
}
