import { Provider } from "react-redux";
import { useEffect, useState } from "react";
import { store } from "@/store";
import { AppShell } from "@/app/AppShell";
import { useAppInit, useTheme } from "@/hooks/useTheme";

const SPLASH_EXIT_MS = 220;

function fadeOutInitialSplash(): Promise<void> {
  const splash = document.getElementById("app-splash");
  if (!splash) return Promise.resolve();

  splash.classList.add("app-splash-exit");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      splash.remove();
      resolve();
    }, SPLASH_EXIT_MS);
  });
}

function AppContent() {
  useTheme();
  const ready = useAppInit();
  const [showApp, setShowApp] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    fadeOutInitialSplash().then(() => {
      if (!cancelled) setShowApp(true);
    });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!showApp) {
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
