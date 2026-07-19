import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

interface VirtualListProps<T> {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  className?: string;
  /** Unique key per item */
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
}

/**
 * Lightweight windowed list — no external virtualizer dependency.
 * Good enough for collection search results and large git file lists.
 */
export function VirtualList<T>({
  items,
  estimateSize = 28,
  overscan = 8,
  className,
  getKey,
  renderItem,
  empty,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(320);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setHeight(h);
    });
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = parentRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  // Below threshold — render all (simpler, keeps DnD-friendly small trees)
  if (items.length <= 80) {
    return (
      <div ref={parentRef} className={className} style={{ overflow: "auto" }}>
        {items.map((item, i) => (
          <div key={getKey(item, i)}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  const total = items.length * estimateSize;
  const start = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan);
  const visibleCount = Math.ceil(Math.max(height, 1) / estimateSize) + overscan * 2;
  const end = Math.min(items.length, start + visibleCount);
  const slice = items.slice(start, end);

  return (
    <div
      ref={parentRef}
      className={className}
      onScroll={onScroll}
      style={{ overflow: "auto", height: "100%", minHeight: 120 }}
    >
      <div style={{ height: total, position: "relative" }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div
              key={getKey(item, index)}
              style={{
                position: "absolute",
                top: index * estimateSize,
                left: 0,
                right: 0,
                height: estimateSize,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
