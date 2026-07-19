import {
  Activity,
  CheckCircle2,
  Clock,
  Link2,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  PRESET_ACCENT_STYLES,
  type ApiTestPreset,
  type ApiTestType,
} from "@/api-testing";
import { InfoTip } from "./InfoTip";
import { cn } from "@/utils/cn";

const ICONS = {
  zap: Zap,
  trending: TrendingUp,
  activity: Activity,
  clock: Clock,
  check: CheckCircle2,
  link: Link2,
} as const;

interface PresetCardsProps {
  presets: ApiTestPreset[];
  selected: ApiTestType;
  onSelect: (id: ApiTestType) => void;
  disabled?: boolean;
}

export function PresetCards({
  presets,
  selected,
  onSelect,
  disabled,
}: PresetCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {presets.map((preset) => {
        const Icon = ICONS[preset.icon];
        const accent = PRESET_ACCENT_STYLES[preset.accent];
        const active = selected === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(preset.id)}
            className={cn(
              "group relative flex flex-col items-start gap-2.5 rounded-xl border p-3 text-left",
              "transition-[border-color,background-color,box-shadow,transform] duration-150",
              "disabled:pointer-events-none disabled:opacity-45",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              accent.border,
              accent.bg,
              active && [
                accent.borderActive,
                accent.bgActive,
                "ring-2",
                accent.ring,
                "shadow-sm",
              ],
              !active && "hover:-translate-y-px",
            )}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  accent.iconBg,
                )}
              >
                <Icon className={cn("h-4 w-4", accent.icon)} />
              </span>
              <InfoTip label={`About ${preset.title}`} side="left">
                <p className="font-medium text-foreground">{preset.title}</p>
                <p className="mt-1 text-muted-foreground">{preset.info}</p>
              </InfoTip>
            </div>
            <div className="min-w-0 space-y-0.5 pr-1">
              <p className="text-sm font-semibold leading-tight text-foreground">
                {preset.title}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {preset.summary}
              </p>
            </div>
            {active ? (
              <span
                className={cn(
                  "absolute inset-x-3 bottom-0 h-0.5 rounded-full opacity-80",
                  accent.iconBg,
                )}
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
