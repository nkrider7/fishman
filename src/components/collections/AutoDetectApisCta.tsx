import { useState } from "react";
import { WandSparkles, X } from "lucide-react";
import { useAppDispatch } from "@/hooks/redux";
import { openScanner } from "@/store/slices/scannerSlice";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const STORAGE_KEY = "fishman.dismissAutoDetectApisCta";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export function AutoDetectApisCta({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <div className={cn("shrink-0 border-t border-border/60 p-3", className)}>
      <div className="relative rounded-lg border border-indigo-500/20 bg-card p-3.5 shadow-sm">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss auto-detect APIs"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="mb-2 flex items-center gap-2 pr-6">
          <WandSparkles className="h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
          <h3 className="text-sm font-semibold leading-none text-foreground">
            Auto-Detect APIs
          </h3>
        </div>

        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          Scan your codebase and discover all available API endpoints
          automatically.
        </p>

        <Button
          type="button"
          size="sm"
          className="h-8 w-full rounded-md bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500"
          onClick={() => dispatch(openScanner())}
        >
          Scan Now
        </Button>
      </div>
    </div>
  );
}
