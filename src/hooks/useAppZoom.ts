import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import type { AppDispatch } from "@/store";
import {
  persistSettingsPatch,
  setZoomLevel,
} from "@/store/slices/settingsSlice";
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  applyDocumentZoom,
  clampZoom,
} from "@/utils/zoom";

export interface AppZoomControls {
  zoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (next: number) => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

/** Debounce DB writes so rapid Ctrl+/- only persists the final level. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingZoom: number | null = null;

function schedulePersistZoom(dispatch: AppDispatch, level: number): void {
  pendingZoom = level;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (pendingZoom === null) return;
    const toSave = pendingZoom;
    pendingZoom = null;
    void dispatch(persistSettingsPatch({ zoomLevel: toSave }));
  }, 180);
}

/**
 * Applies persisted UI zoom and exposes zoom controls.
 * Keyboard shortcuts are registered separately via `useZoomKeyboardShortcuts`
 * so listeners are not duplicated when multiple components consume this hook.
 */
export function useAppZoom(): AppZoomControls {
  const dispatch = useAppDispatch();
  const zoomLevel = useAppSelector((s) => s.settings.zoomLevel);
  const loaded = useAppSelector((s) => s.settings.loaded);
  const zoomRef = useRef(zoomLevel);
  zoomRef.current = zoomLevel;

  useEffect(() => {
    if (!loaded) return;
    applyDocumentZoom(zoomLevel);
  }, [loaded, zoomLevel]);

  const setZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      if (clamped === zoomRef.current) return;
      zoomRef.current = clamped;
      dispatch(setZoomLevel(clamped));
      applyDocumentZoom(clamped);
      schedulePersistZoom(dispatch, clamped);
    },
    [dispatch],
  );

  const zoomIn = useCallback(
    () => setZoom(zoomRef.current + ZOOM_STEP),
    [setZoom],
  );
  const zoomOut = useCallback(
    () => setZoom(zoomRef.current - ZOOM_STEP),
    [setZoom],
  );
  const resetZoom = useCallback(() => setZoom(ZOOM_DEFAULT), [setZoom]);

  return {
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    canZoomIn: zoomLevel < ZOOM_MAX,
    canZoomOut: zoomLevel > ZOOM_MIN,
  };
}

/** Register Ctrl/Cmd + / - / 0 zoom shortcuts once (call from AppShell). */
export function useZoomKeyboardShortcuts(): void {
  const { zoomIn, zoomOut, resetZoom } = useAppZoom();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;

      const isZoomIn =
        e.key === "=" ||
        e.key === "+" ||
        e.code === "Equal" ||
        e.code === "NumpadAdd";
      if (isZoomIn) {
        e.preventDefault();
        e.stopPropagation();
        zoomIn();
        return;
      }

      const isZoomOut =
        e.key === "-" ||
        e.key === "_" ||
        e.code === "Minus" ||
        e.code === "NumpadSubtract";
      if (isZoomOut) {
        e.preventDefault();
        e.stopPropagation();
        zoomOut();
        return;
      }

      if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
        e.preventDefault();
        e.stopPropagation();
        resetZoom();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [zoomIn, zoomOut, resetZoom]);
}
