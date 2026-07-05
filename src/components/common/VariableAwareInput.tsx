import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useUpdateEnvironmentVariable } from "@/hooks/useUpdateEnvironmentVariable";
import { useVariableContext } from "@/hooks/useVariableContext";
import { parseVariableSegments } from "@/utils/variableDisplay";
import type { VariableScope } from "@/utils/variableSubstitution";
import { VariablePopover } from "@/components/common/VariablePopover";
import { cn } from "@/utils/cn";

interface VariableAwareInputProps
  extends Omit<ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  collectionId?: string | null;
  inputSize?: "default" | "sm";
}

interface PopoverAnchor {
  name: string;
  top: number;
  left: number;
  editing?: boolean;
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

export function VariableAwareInput({
  value,
  onChange,
  collectionId,
  className,
  placeholder,
  inputSize = "default",
  ...props
}: VariableAwareInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const { resolveVariable, variableInfo } = useVariableContext(collectionId);
  const { updateVariable, getEditTarget, canEdit } =
    useUpdateEnvironmentVariable(collectionId);
  const [hoverAnchor, setHoverAnchor] = useState<PopoverAnchor | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<PopoverAnchor | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const containerClass = getContainerClass(inputSize);
  const inputClass = getInputClass(inputSize);
  const mirrorClass = getMirrorClass(inputSize);

  const segments = useMemo(() => parseVariableSegments(value), [value]);
  const hasVariables = value.includes("{{");

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
      const token = getVariableTokenFromPoint(clientX, clientY);
      if (!token) {
        setHoverAnchor(null);
        return;
      }
      setHoverAnchor(token);
    },
    [getVariableTokenFromPoint],
  );

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (pinnedAnchor) return;
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
    setHoverAnchor(null);
    setPinnedAnchor({ ...token, editing: true });
  };

  const closePinnedPopover = useCallback(() => {
    setPinnedAnchor(null);
  }, []);

  const handleSaveVariable = useCallback(
    (name: string, value: string) => {
      updateVariable(name, value);
      closePinnedPopover();
    },
    [updateVariable, closePinnedPopover],
  );

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pinnedAnchor.editing) {
        closePinnedPopover();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pinnedAnchor, closePinnedPopover]);

  if (!hasVariables) {
    return (
      <div className={cn(containerClass, className)}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          className={cn(
            inputClass,
            "text-foreground focus-visible:outline-none",
          )}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          {...props}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(containerClass, className)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      >
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
                  canEdit ? "cursor-pointer" : "cursor-default",
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

        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          className={cn(
            inputClass,
            "text-transparent caret-foreground selection:bg-primary/20",
          )}
          onChange={(e) => onChange(e.target.value)}
          onDoubleClick={handleDoubleClick}
          spellCheck={false}
          {...props}
        />
      </div>

      {popoverDetails &&
        createPortal(
          <div ref={popoverRef}>
            <VariablePopover
              name={popoverDetails.name}
              value={popoverDetails.value}
              scope={popoverDetails.scope}
              isLive={popoverDetails.isLive}
              editing={popoverDetails.editing}
              canEdit={canEdit}
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
