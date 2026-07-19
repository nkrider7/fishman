import { Provider } from "react-redux";
import { useEffect, useRef, useState } from "react";
import { store } from "@/store";
import { AppShell } from "@/app/AppShell";
import { useAppInit, useTheme } from "@/hooks/useTheme";

const SPLASH_EXIT_MS = 200;

function setSplashStatus(text: string): void {
  const el = document.getElementById("app-splash-status");
  if (el) el.textContent = text;
}

function fadeOutInitialSplash(): Promise<void> {
  const splash = document.getElementById("app-splash");
  if (!splash) return Promise.resolve();

  splash.setAttribute("aria-busy", "false");
  splash.classList.add("app-splash-exit");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      splash.remove();
      resolve();
    }, SPLASH_EXIT_MS);
  });
}

/** Wait two animation frames so AppShell has painted under the splash. */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function AppContent() {
  useTheme();
  const { ready, phase } = useAppInit();
  const [shellMounted, setShellMounted] = useState(false);
  const splashDismissed = useRef(false);

  useEffect(() => {
    if (phase === "workspace") {
      setSplashStatus("Loading workspace…");
    } else if (phase === "ready") {
      setSplashStatus("Almost ready…");
    }
  }, [phase]);

  // Mount shell under splash once critical boot finishes — no blank frame.
  useEffect(() => {
    if (ready) setShellMounted(true);
  }, [ready]);

  // Fade splash only after shell has painted at least one frame.
  useEffect(() => {
    if (!shellMounted || splashDismissed.current) return;
    let cancelled = false;

    void (async () => {
      await waitForPaint();
      if (cancelled || splashDismissed.current) return;
      splashDismissed.current = true;
      await fadeOutInitialSplash();
    })();

    return () => {
      cancelled = true;
    };
  }, [shellMounted]);

  if (!shellMounted) {
    // Keep HTML splash visible; React renders nothing underneath yet.
    return null;
  }

  return (
    <div className="app-shell-enter h-full">
      <AppShell />
    </div>
  );
}

export function Providers() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}
