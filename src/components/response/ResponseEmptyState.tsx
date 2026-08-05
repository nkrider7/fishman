import jinbeFishing from "@/assets/fishmanlogoline.png";

/**
 * Idle response panel — brand empty state before the first send.
 */
export function ResponseEmptyState() {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

  const mod = isMac ? "⌘" : "Ctrl";
  const shortcuts = [
    { keys: [mod, "Enter"], label: "Send request" },
    { keys: [mod, "S"], label: "Save request" },
    { keys: [mod, "N"], label: "New request" },
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6 py-8 text-center">
      <div className="flex items-center justify-center rounded-2xl px-5  ">
        <img
          src={jinbeFishing}
          alt=""
          draggable={false}
          className="h-32 w-auto select-none object-contain dark:invert-0 opacity-55 invert dark:opacity-40"
        />
      </div>
      {/* <h2 className="text-base font-bold tracking-tight text-foreground/65">
        Waiting for a catch here 
      </h2> */}
      {/* <p className="mt-1.5 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
        Send a request and the response will land here — status, body, headers,
        and timing.
      </p> */}

      <div className="mt-6 w-full max-w-[280px] space-y-2 text-left">
        {/* <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Shortcuts
        </p> */}
        <ul className="space-y-1.5">
          {shortcuts.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 px-2.5 py-1.5"
            >
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="flex items-center gap-1">
                {item.keys.map((key, index) => (
                  <span key={`${item.label}-${key}-${index}`} className="flex items-center gap-1">
                    {index > 0 && (
                      <span className="text-[10px] text-muted-foreground/50">
                        +
                      </span>
                    )}
                    <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 shadow-sm">
                      {key}
                    </kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
