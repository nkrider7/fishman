import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useUpdateEnvironmentVariable } from "@/hooks/useUpdateEnvironmentVariable";
import { useVariableContext } from "@/hooks/useVariableContext";
import { useVariableSuggestionCatalogFactory } from "@/hooks/useVariableSuggestionCatalog";
import { useTextUndoHistory } from "@/hooks/useTextUndoHistory";
import { parseVariableSegments } from "@/utils/variableDisplay";
import type { VariableScope } from "@/utils/variableSubstitution";
import { VariablePopover } from "@/components/common/VariablePopover";
import { VariableSuggestionList } from "@/components/common/VariableSuggestionList";
import {
  applySuggestion,
  detectOpenVariable,
  type VariableSuggestion,
} from "@/variables/suggestions";
import { rememberTextSelection } from "@/url-replace/selection-cache";
import { cn } from "@/utils/cn";

interface VariableAwareInputProps
  extends Omit<ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  collectionId?: string | null;
  inputSize?: "default" | "sm";
  /** Disable {{ autocomplete (defaults to enabled). */
  enableSuggestions?: boolean;
  /** Ctrl/Cmd+Z undo and Ctrl/Cmd+Y / Shift+Z redo (defaults to enabled). */
  enableUndoRedo?: boolean;
}

interface PopoverAnchor {
  name: string;
  top: number;
  left: number;
  editing?: boolean;
}

interface SuggestMenuState {
  open: boolean;
  query: string;
  activeIndex: number;
  top: number;
  left: number;
  width: number;
}

const SIZE_STYLES = {
  sm: {
    container: "h-8",
    text: "text-xs leading-8",
  },
  default: {
    container: "h-9",
    text: "text-sm leading-9",
  },
} as const;

const CLOSED_MENU: SuggestMenuState = {
  open: false,
  query: "",
  activeIndex: 0,
  top: 0,
  left: 0,
  width: 320,
};

function getContainerClass(size: "default" | "sm") {
  const styles = SIZE_STYLES[size];
  return cn(
    "relative w-full min-w-0 overflow-hidden rounded-md border border-input bg-transparent shadow-sm transition-colors",
    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50",
    styles.container,
  );
}

function getInputClass(size: "default" | "sm") {
  const styles = SIZE_STYLES[size];
  return cn(
    "h-full w-full appearance-none border-0 bg-transparent px-3 py-0 font-mono outline-none",
    "placeholder:text-muted-foreground",
    "disabled:cursor-not-allowed disabled:opacity-50",
    styles.text,
  );
}

function getMirrorClass(size: "default" | "sm") {
  const styles = SIZE_STYLES[size];
  return cn(
    "pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 font-mono",
    styles.text,
  );
}

function menuPositionForInput(input: HTMLInputElement): {
  top: number;
  left: number;
  width: number;
} {
  const rect = input.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 280), 420);
  const left = Math.min(
    Math.max(8, rect.left),
    window.innerWidth - width - 8,
  );
  const below = rect.bottom + 4;
  const estimatedHeight = 256;
  const top =
    below + estimatedHeight > window.innerHeight - 8
      ? Math.max(8, rect.top - estimatedHeight - 4)
      : below;
  return { top, left, width };
}

export function VariableAwareInput({
  value,
  onChange,
  collectionId,
  className,
  placeholder,
  inputSize = "default",
  enableSuggestions = true,
  enableUndoRedo = true,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}: VariableAwareInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const { resolveVariable, variableInfo } = useVariableContext(collectionId);
  const getSuggestions = useVariableSuggestionCatalogFactory(collectionId);
  const { updateVariable, getEditTarget, canEdit, willCreateEnvironment } =
    useUpdateEnvironmentVariable(collectionId);
  const { pushChange, undo, redo } = useTextUndoHistory({
    value,
    onChange,
    enabled: enableUndoRedo,
  });
  const [hoverAnchor, setHoverAnchor] = useState<PopoverAnchor | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<PopoverAnchor | null>(null);
  const [menu, setMenu] = useState<SuggestMenuState>(CLOSED_MENU);
  const popoverRef = useRef<HTMLDivElement>(null);

  const containerClass = getContainerClass(inputSize);
  const inputClass = getInputClass(inputSize);
  const mirrorClass = getMirrorClass(inputSize);

  const segments = useMemo(() => parseVariableSegments(value), [value]);
  const hasVariables = value.includes("{{");

  const suggestions = useMemo(
    () => (menu.open ? getSuggestions(menu.query) : []),
    [menu.open, menu.query, getSuggestions],
  );

  const activeAnchor = pinnedAnchor ?? hoverAnchor;

  const popoverDetails = useMemo(() => {
    if (!activeAnchor) return null;
    const info = resolveVariable(activeAnchor.name);
    const editTarget = getEditTarget(activeAnchor.name);
    return {
      name: activeAnchor.name,
      value: info?.value ?? null,
      scope: (info?.scope ?? "unresolved") as VariableScope | "unresolved",
      isLive: info?.isLive ?? false,
      editing: activeAnchor.editing ?? false,
      editScope: editTarget?.scope ?? null,
      editEnvName: editTarget?.env.name ?? null,
      top: activeAnchor.top,
      left: activeAnchor.left,
    };
  }, [activeAnchor, resolveVariable, variableInfo, getEditTarget]);

  const closeMenu = useCallback(() => {
    setMenu(CLOSED_MENU);
  }, []);

  const syncSuggestions = useCallback(
    (nextValue: string, caret: number) => {
      if (!enableSuggestions || pinnedAnchor) {
        closeMenu();
        return;
      }
      const match = detectOpenVariable(nextValue, caret);
      const input = inputRef.current;
      if (!match || !input) {
        closeMenu();
        return;
      }
      const pos = menuPositionForInput(input);
      setMenu((prev) => ({
        open: true,
        query: match.query,
        activeIndex:
          prev.open && prev.query === match.query ? prev.activeIndex : 0,
        ...pos,
      }));
    },
    [enableSuggestions, closeMenu, pinnedAnchor],
  );

  const acceptSuggestion = useCallback(
    (item: VariableSuggestion) => {
      const input = inputRef.current;
      if (!input) return;
      const caret = input.selectionStart ?? value.length;
      const match = detectOpenVariable(value, caret);
      if (!match) {
        closeMenu();
        return;
      }
      const result = applySuggestion(value, match, item);
      pendingCaretRef.current = result.caret;
      pushChange(result.value);
      closeMenu();
      window.requestAnimationFrame(() => {
        input.focus();
        const pos = pendingCaretRef.current ?? result.caret;
        input.setSelectionRange(pos, pos);
        pendingCaretRef.current = null;
      });
    },
    [value, pushChange, closeMenu],
  );

  const handleValueChange = (nextValue: string, caret: number) => {
    pushChange(nextValue);
    syncSuggestions(nextValue, caret);
  };

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return;
    const input = inputRef.current;
    if (!input) return;
    const pos = pendingCaretRef.current;
    input.setSelectionRange(pos, pos);
    pendingCaretRef.current = null;
  }, [value]);

  const getVariableTokenFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const input = inputRef.current;
      if (!input || !hasVariables) return null;

      const prev = input.style.pointerEvents;
      input.style.pointerEvents = "none";
      const target = document.elementFromPoint(clientX, clientY);
      input.style.pointerEvents = prev;

      const token = target?.closest("[data-var-name]") as HTMLElement | null;
      if (!token || !containerRef.current?.contains(token)) return null;

      const name = token.dataset.varName;
      if (!name) return null;

      const rect = token.getBoundingClientRect();
      return {
        name,
        top: rect.bottom + 6,
        left: rect.left,
      };
    },
    [hasVariables],
  );

  const updateHoverFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (menu.open) {
        setHoverAnchor(null);
        return;
      }
      const token = getVariableTokenFromPoint(clientX, clientY);
      if (!token) {
        setHoverAnchor(null);
        return;
      }
      setHoverAnchor(token);
    },
    [getVariableTokenFromPoint, menu.open],
  );

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (pinnedAnchor || menu.open) return;
    if (rafRef.current !== null) return;
    const { clientX, clientY } = event;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateHoverFromPoint(clientX, clientY);
    });
  };

  const handleMouseLeave = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!pinnedAnchor) {
      setHoverAnchor(null);
    }
  };

  const handleDoubleClick = (
    event: MouseEvent<HTMLDivElement | HTMLInputElement>,
  ) => {
    const token = getVariableTokenFromPoint(event.clientX, event.clientY);
    if (!token) return;

    event.preventDefault();
    event.stopPropagation();
    setHoverAnchor(null);
    closeMenu();
    setPinnedAnchor({ ...token, editing: true });
  };

  const closePinnedPopover = useCallback(() => {
    setPinnedAnchor(null);
  }, []);

  const handleSaveVariable = useCallback(
    async (name: string, nextValue: string) => {
      const ok = await updateVariable(name, nextValue);
      if (ok) closePinnedPopover();
    },
    [updateVariable, closePinnedPopover],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && enableUndoRedo) {
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        undo();
        closeMenu();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        redo();
        closeMenu();
        return;
      }
    }

    if (menu.open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenu((prev) => ({
          ...prev,
          activeIndex:
            suggestions.length === 0
              ? 0
              : (prev.activeIndex + 1) % suggestions.length,
        }));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenu((prev) => ({
          ...prev,
          activeIndex:
            suggestions.length === 0
              ? 0
              : (prev.activeIndex - 1 + suggestions.length) %
                suggestions.length,
        }));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = suggestions[menu.activeIndex];
        if (item) {
          event.preventDefault();
          acceptSuggestion(item);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
    }

    onKeyDown?.(event);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pinnedAnchor) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target)) return;
      if (containerRef.current?.contains(target)) return;
      closePinnedPopover();
    };

    const handleDocKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !pinnedAnchor.editing) {
        closePinnedPopover();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleDocKeyDown);
    };
  }, [pinnedAnchor, closePinnedPopover]);

  // Keep activeIndex in range when the filtered list shrinks.
  useEffect(() => {
    if (!menu.open) return;
    if (menu.activeIndex >= suggestions.length) {
      setMenu((prev) => ({
        ...prev,
        activeIndex: Math.max(0, suggestions.length - 1),
      }));
    }
  }, [menu.open, menu.activeIndex, suggestions.length]);

  const canEditResolved =
    Boolean(canEdit) &&
    popoverDetails?.scope !== "dynamic" &&
    popoverDetails?.scope !== "folder";

  return (
    <>
      <div
        ref={containerRef}
        className={cn(containerClass, className)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      >
        {hasVariables ? (
          <div className={mirrorClass} aria-hidden>
            <span className="min-w-0 whitespace-pre">
              {segments.map((segment, index) => {
                if (segment.type === "text") {
                  return (
                    <span key={index} className="text-foreground">
                      {segment.text}
                    </span>
                  );
                }

                const info = resolveVariable(segment.name ?? "");
                const resolved = Boolean(info);

                return (
                  <span
                    key={`${index}-${segment.name}-${resolved ? "ok" : "missing"}`}
                    data-var-name={segment.name}
                    className={cn(
                      "pointer-events-auto rounded-sm",
                      canEdit && info?.scope !== "dynamic" && info?.scope !== "folder"
                        ? "cursor-pointer"
                        : "cursor-default",
                      resolved
                        ? "text-[#49cc90]"
                        : "text-amber-400 underline decoration-dotted decoration-amber-400/60",
                    )}
                  >
                    {segment.text}
                  </span>
                );
              })}
            </span>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          className={cn(
            inputClass,
            hasVariables
              ? "text-transparent caret-foreground selection:bg-primary/20"
              : "text-foreground focus-visible:outline-none",
          )}
          onChange={(e) => {
            const next = e.target.value;
            const caret = e.target.selectionStart ?? next.length;
            handleValueChange(next, caret);
          }}
          onSelect={(e) => {
            const target = e.currentTarget;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            if (
              typeof start === "number" &&
              typeof end === "number" &&
              end > start
            ) {
              rememberTextSelection(target.value.slice(start, end));
            }
            if (!enableSuggestions || !menu.open) return;
            syncSuggestions(
              target.value,
              target.selectionStart ?? target.value.length,
            );
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            onFocus?.(e);
            if (!enableSuggestions) return;
            const caret = e.currentTarget.selectionStart ?? value.length;
            syncSuggestions(value, caret);
          }}
          onBlur={(e) => {
            // Delay so mousedown on suggestion can fire first.
            window.setTimeout(() => {
              if (
                document.activeElement === inputRef.current ||
                document.activeElement?.closest?.(
                  '[aria-label="Variable suggestions"]',
                )
              ) {
                return;
              }
              closeMenu();
            }, 0);
            onBlur?.(e);
          }}
          onDoubleClick={handleDoubleClick}
          spellCheck={false}
          autoComplete="off"
          aria-autocomplete={enableSuggestions ? "list" : undefined}
          aria-expanded={enableSuggestions ? menu.open : undefined}
          {...props}
        />
      </div>

      {menu.open && enableSuggestions ? (
        <VariableSuggestionList
          items={suggestions}
          activeIndex={menu.activeIndex}
          top={menu.top}
          left={menu.left}
          width={menu.width}
          onHoverIndex={(index) =>
            setMenu((prev) => ({ ...prev, activeIndex: index }))
          }
          onSelect={acceptSuggestion}
          onClose={closeMenu}
        />
      ) : null}

      {popoverDetails &&
        !menu.open &&
        createPortal(
          <div ref={popoverRef}>
            <VariablePopover
              name={popoverDetails.name}
              value={popoverDetails.value}
              scope={popoverDetails.scope}
              isLive={popoverDetails.isLive}
              editing={popoverDetails.editing}
              canEdit={Boolean(canEditResolved)}
              willCreateEnvironment={willCreateEnvironment}
              editScope={popoverDetails.editScope}
              editEnvName={popoverDetails.editEnvName}
              onSave={(nextValue) =>
                handleSaveVariable(popoverDetails.name, nextValue)
              }
              onCancelEdit={closePinnedPopover}
              style={{
                position: "fixed",
                top: popoverDetails.top,
                left: popoverDetails.left,
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
