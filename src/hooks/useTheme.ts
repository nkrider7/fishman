import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { loadSettings } from "@/store/slices/settingsSlice";
import { initializeDatabase } from "@/services/dbService";
import { bootstrapWorkspaces } from "@/workspaces";

export type AppInitPhase = "boot" | "workspace" | "ready";

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

export function useAppInit(): { ready: boolean; phase: AppInitPhase } {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<AppInitPhase>("boot");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const startedAt = Date.now();
      try {
        setPhase("boot");
        await initializeDatabase();
        // Settings + workspace bootstrap: settings is independent of workspace list
        // but bootstrap needs DB — run settings in parallel with bootstrap after DB.
        setPhase("workspace");
        await Promise.all([
          dispatch(loadSettings()),
          dispatch(bootstrapWorkspaces()),
        ]);
      } finally {
        const elapsed = Date.now() - startedAt;
        // Tiny hold only when boot was instant — avoids a jarring flash.
        const minSplashMs = 80;
        if (elapsed < minSplashMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, minSplashMs - elapsed),
          );
        }
        if (!cancelled) {
          setPhase("ready");
          setReady(true);
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return { ready, phase };
}
