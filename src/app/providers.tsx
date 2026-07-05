import { Provider } from "react-redux";
import { useEffect } from "react";
import { store } from "@/store";
import { AppShell } from "@/app/AppShell";
import { useAppInit, useTheme } from "@/hooks/useTheme";

function removeInitialSplash() {
  document.getElementById("app-splash")?.remove();
}

function AppContent() {
  useTheme();
  const ready = useAppInit();

  useEffect(() => {
    if (ready) removeInitialSplash();
  }, [ready]);

  if (!ready) {
    return null;
  }

  return <AppShell />;
}

export function Providers() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}
