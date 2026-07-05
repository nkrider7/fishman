import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { loadSettings } from "@/store/slices/settingsSlice";
import { fetchCollections } from "@/store/slices/collectionsSlice";
import { fetchHistory } from "@/store/slices/historySlice";
import { fetchEnvironments } from "@/store/slices/environmentSlice";
import { initializeDatabase } from "@/services/dbService";

export function useTheme() {
  const theme = useAppSelector((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => {
      root.classList.toggle("dark", dark);
    };

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const listener = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }

    apply(theme === "dark");
  }, [theme]);
}

export function useAppInit() {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const startedAt = Date.now();
      try {
        await initializeDatabase();
        dispatch(loadSettings());
        await Promise.all([
          dispatch(fetchCollections()),
          dispatch(fetchHistory()),
          dispatch(fetchEnvironments()),
        ]);
      } finally {
        const elapsed = Date.now() - startedAt;
        const minSplashMs = 300;
        if (elapsed < minSplashMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, minSplashMs - elapsed),
          );
        }
        if (!cancelled) setReady(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return ready;
}
