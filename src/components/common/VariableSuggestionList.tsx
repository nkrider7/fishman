import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { VariableSuggestion } from "@/variables/suggestions";
import { cn } from "@/utils/cn";

interface VariableSuggestionListProps {
  items: VariableSuggestion[];
  activeIndex: number;
  top: number;
  left: number;
  width?: number;
  onHoverIndex: (index: number) => void;
  onSelect: (item: VariableSuggestion) => void;
  onClose: () => void;
}

const KIND_CLASS: Record<VariableSuggestion["kind"], string> = {
  environment: "text-emerald-500",
  folder: "text-sky-500",
  dynamic: "text-violet-500",
};

export function VariableSuggestionList({
  items,
  activeIndex,
  top,
  left,
  width = 320,
  onHoverIndex,
  onSelect,
  onClose,
}: VariableSuggestionListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (listRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  if (items.length === 0) {
    return createPortal(
      <div
        ref={listRef}
        role="listbox"
        className="z-[80] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        style={{
          position: "fixed",
          top,
          left,
          width: Math.max(width, 240),
        }}
      >
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No matching variables
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="Variable suggestions"
      className="z-[80] max-h-64 overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      style={{
        position: "fixed",
        top,
        left,
        width: Math.max(width, 280),
      }}
    >
      {items.map((item, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={item.id}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
            )}
            onMouseEnter={() => onHoverIndex(index)}
            onMouseDown={(e) => {
              // Keep input focus; mousedown would blur before click.
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="min-w-0 flex-1 truncate font-mono font-medium">
              {item.name}
            </span>
            {item.detail ? (
              <span className="max-w-[40%] truncate text-[10px] text-muted-foreground">
                {item.detail}
              </span>
            ) : null}
            <span
              className={cn(
                "shrink-0 text-[10px] font-medium uppercase tracking-wide",
                KIND_CLASS[item.kind],
              )}
            >
              {item.sourceLabel}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
