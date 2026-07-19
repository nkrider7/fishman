import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import JsonView from "@uiw/react-json-view";
import { formatJsonAccessPath } from "@/utils/jsonAccessPath";
import { cn } from "@/utils/cn";

interface JsonTreeViewerProps {
  value: object;
}

interface PathTip {
  path: string;
  left: number;
  top: number;
}

export function JsonTreeViewer({ value }: JsonTreeViewerProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [tip, setTip] = useState<PathTip | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const showPath = (
    keys: readonly (string | number)[] | undefined,
    el: HTMLElement,
  ) => {
    const path = formatJsonAccessPath(keys ?? []);
    const rect = el.getBoundingClientRect();
    setActivePath(path);
    setTip({
      path,
      left: rect.left + rect.width / 2,
      top: rect.top - 6,
    });
    void navigator.clipboard.writeText(path).catch(() => {
      // Clipboard can fail in some environments; tip still helps.
    });

    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setTip(null);
      setActivePath(null);
      hideTimer.current = null;
    }, 2000);
  };

  return (
    <div className="relative h-full overflow-auto px-3 py-2.5 text-[12px]">
      <JsonView
        value={value}
        collapsed={2}
        displayDataTypes={false}
        style={
          {
            backgroundColor: "transparent",
            fontSize: 12,
            "--w-rjv-font-family":
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          } as CSSProperties
        }
      >
        <JsonView.Row
          as="div"
          render={(props, { keys }) => {
            const path = formatJsonAccessPath(keys ?? []);
            const selected = path === activePath;
            return (
              <div
                {...props}
                className={cn(
                  props.className,
                  "rounded-sm transition-colors",
                  selected && "bg-muted/70",
                )}
              />
            );
          }}
        />
        <JsonView.KeyName
          as="span"
          render={(props, { keys }) => (
            <span
              {...props}
              title="Click to copy access path"
              className={cn(
                props.className,
                "cursor-pointer rounded-sm underline-offset-2 hover:underline",
              )}
              onClick={(event) => {
                event.stopPropagation();
                showPath(keys, event.currentTarget);
              }}
            />
          )}
        />
      </JsonView>

      {tip
        ? createPortal(
            <div
              role="status"
              className="pointer-events-none fixed z-100 max-w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 font-mono text-[11px] text-popover-foreground shadow-md"
              style={{ left: tip.left, top: tip.top }}
            >
              <span className="break-all">{tip.path}</span>
              <span className="ml-2 text-muted-foreground">copied</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
