import jinbeFishing from "@/assets/fishmanlogoline.png";

/** Idle message area before the first connect / message. */
export function WsEmptyState() {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6 py-8 text-center">
      <img
        src={jinbeFishing}
        alt=""
        draggable={false}
        className="h-24 w-auto select-none object-contain opacity-45 invert dark:invert-0 dark:opacity-35"
      />
      <p className="mt-3 text-sm text-muted-foreground">
        Connect to start streaming messages
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        Press{" "}
        <kbd className="rounded border border-border/60 bg-background px-1 py-0.5 font-mono text-[10px]">
          {mod}
        </kbd>{" "}
        +{" "}
        <kbd className="rounded border border-border/60 bg-background px-1 py-0.5 font-mono text-[10px]">
          Enter
        </kbd>{" "}
        to connect
      </p>
    </div>
  );
}
