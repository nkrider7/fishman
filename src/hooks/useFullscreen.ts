import { useCallback, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import type { AppDispatch } from "@/store";
import { setFullscreen as setFullscreenState } from "@/store/slices/uiSlice";
import { getFullscreen, setFullscreen } from "@/tauri/window";

export interface FullscreenControls {
  fullscreen: boolean;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

/** Shared across hook instances so resize sync doesn't undo an in-flight toggle. */
let suppressOsSyncUntil = 0;

async function readFullscreen(): Promise<boolean> {
  try {
    return await getFullscreen();
  } catch {
    return false;
  }
}

async function syncFromOs(dispatch: AppDispatch): Promise<void> {
  if (Date.now() < suppressOsSyncUntil) return;
  dispatch(setFullscreenState(await readFullscreen()));
}

/**
 * Read/toggle fullscreen from shared Redux state.
 * Toggle uses Redux as the source of truth so a second click always exits.
 */
export function useFullscreen(): FullscreenControls {
  const dispatch = useAppDispatch();
  const fullscreen = useAppSelector((s) => s.ui.fullscreen);

  const applyFullscreen = useCallback(
    async (next: boolean) => {
      dispatch(setFullscreenState(next));
      suppressOsSyncUntil = Date.now() + 450;
      try {
        await setFullscreen(next);
      } catch {
        dispatch(setFullscreenState(!next));
        suppressOsSyncUntil = 0;
        return;
      }
      window.setTimeout(() => {
        suppressOsSyncUntil = 0;
        void syncFromOs(dispatch);
      }, 480);
    },
    [dispatch],
  );

  const enterFullscreen = useCallback(
    () => applyFullscreen(true),
    [applyFullscreen],
  );

  const exitFullscreen = useCallback(
    () => applyFullscreen(false),
    [applyFullscreen],
  );

  const toggleFullscreen = useCallback(async () => {
    await applyFullscreen(!fullscreen);
  }, [applyFullscreen, fullscreen]);

  return {
    fullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}

/**
 * Sync OS/browser fullscreen into Redux and register F11 / Escape.
 * Call once from AppShell.
 */
export function useFullscreenKeyboardShortcuts(): void {
  const dispatch = useAppDispatch();
  const { fullscreen, toggleFullscreen, exitFullscreen } = useFullscreen();

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      await syncFromOs(dispatch);
    };

    void refresh();

    const onBrowserFullscreenChange = () => {
      void refresh();
    };
    document.addEventListener("fullscreenchange", onBrowserFullscreenChange);

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void (async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const stop = await win.onResized(() => {
            void refresh();
          });
          if (cancelled) {
            stop();
            return;
          }
          unlisten = stop;
        } catch {
          // ignore
        }
      })();
    }

    return () => {
      cancelled = true;
      document.removeEventListener(
        "fullscreenchange",
        onBrowserFullscreenChange,
      );
      unlisten?.();
    };
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        void toggleFullscreen();
        return;
      }
      if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        e.stopPropagation();
        void exitFullscreen();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [fullscreen, toggleFullscreen, exitFullscreen]);
}
