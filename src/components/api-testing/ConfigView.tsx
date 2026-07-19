import { useMemo, useState } from "react";
import { ChevronRight, Play } from "lucide-react";
import {
  API_TEST_PRESETS,
  FIELD_HELP,
  PRESET_ACCENT_STYLES,
  TEST_TYPE_LABELS,
  applyPreset,
  type ApiTestConfig,
  type ApiTestType,
  type RampCurve,
} from "@/api-testing";
import { PresetCards } from "./PresetCards";
import { InfoTip } from "./InfoTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HTTP_METHODS, type HttpMethod } from "@/types/request";
import { cn } from "@/utils/cn";

interface ConfigViewProps {
  config: ApiTestConfig;
  onChange: (patch: Partial<ApiTestConfig>) => void;
  onReplace: (next: ApiTestConfig) => void;
  onUseActiveRequest: () => void;
  onRun: () => void;
  disabled?: boolean;
  error?: string | null;
}

export function ConfigView({
  config,
  onChange,
  onReplace,
  onUseActiveRequest,
  onRun,
  disabled,
  error,
}: ConfigViewProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canRun = Boolean(config.url.trim()) && !disabled;

  const selectedPreset = useMemo(
    () => API_TEST_PRESETS.find((p) => p.id === config.testType),
    [config.testType],
  );
  const accent = selectedPreset
    ? PRESET_ACCENT_STYLES[selectedPreset.accent]
    : null;

  const selectPreset = (id: ApiTestType) => {
    onReplace(applyPreset(config, id));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick start
            </h3>
            {/* <InfoTip label="About quick start">
              Pick a preset to fill sensible defaults. You can still edit every
              field below before running.
            </InfoTip> */}
          </div>
          <PresetCards
            presets={API_TEST_PRESETS}
            selected={config.testType}
            onSelect={selectPreset}
            disabled={disabled}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Configuration
            </h3>
            {selectedPreset ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  accent?.iconBg,
                  accent?.icon,
                )}
              >
                {selectedPreset.title}
              </span>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <FieldLabel
              label="Test type"
              tip={selectedPreset?.info ?? "Choose how load is applied."}
            />
            <Select
              value={config.testType}
              onValueChange={(v) => selectPreset(v as ApiTestType)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TEST_TYPE_LABELS) as ApiTestType[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {TEST_TYPE_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={config.method}
              onValueChange={(v) => onChange({ method: v as HttpMethod })}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-9 min-w-[200px] flex-1"
              placeholder="https://api.example.com/endpoint"
              value={config.url}
              onChange={(e) => onChange({ url: e.target.value })}
              disabled={disabled}
            />
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              onClick={onUseActiveRequest}
              disabled={disabled}
              title={FIELD_HELP.useActive}
            >
              Use Active Request
              <InfoTip label="Use active request">{FIELD_HELP.useActive}</InfoTip>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {config.testType !== "stress" && config.testType !== "spike" ? (
              <NumberField
                label="Virtual users"
                tip={FIELD_HELP.virtualUsers}
                value={config.virtualUsers}
                min={1}
                max={500}
                disabled={disabled}
                onChange={(n) => onChange({ virtualUsers: n })}
              />
            ) : null}
            <NumberField
              label="Duration (seconds)"
              tip={FIELD_HELP.duration}
              value={config.durationSec}
              min={1}
              max={config.testType === "soak" ? 3600 : 600}
              disabled={disabled}
              onChange={(n) => onChange({ durationSec: n })}
            />
            <NumberField
              label="Requests / VU"
              tip={FIELD_HELP.requestsPerVu}
              value={config.requestsPerVu}
              min={0}
              max={10000}
              disabled={disabled}
              onChange={(n) => onChange({ requestsPerVu: n })}
              hint="0 = until duration ends"
            />
          </div>

          {config.testType === "stress" ? (
            <div
              className={cn(
                "grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-4",
                "border-rose-500/30 bg-rose-500/[0.06]",
              )}
            >
              <div className="space-y-1.5 sm:col-span-1">
                <FieldLabel label="Ramp curve" tip={FIELD_HELP.rampCurve} />
                <Select
                  value={config.rampCurve}
                  onValueChange={(v) =>
                    onChange({ rampCurve: v as RampCurve })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="stepped">Stepped</SelectItem>
                    <SelectItem value="exponential">Exponential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Start VUs"
                tip={FIELD_HELP.rampStart}
                value={config.rampStartVus}
                min={1}
                max={500}
                disabled={disabled}
                onChange={(n) => onChange({ rampStartVus: n })}
              />
              <NumberField
                label="End VUs"
                tip={FIELD_HELP.rampEnd}
                value={config.rampEndVus}
                min={1}
                max={500}
                disabled={disabled}
                onChange={(n) => onChange({ rampEndVus: n })}
              />
              <NumberField
                label="Error threshold %"
                tip={FIELD_HELP.errorThreshold}
                value={config.errorRateThresholdPct}
                min={0}
                max={100}
                disabled={disabled}
                onChange={(n) => onChange({ errorRateThresholdPct: n })}
              />
            </div>
          ) : null}

          {config.testType === "spike" ? (
            <div
              className={cn(
                "grid grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-4",
                "border-violet-500/30 bg-violet-500/[0.06]",
              )}
            >
              <NumberField
                label="Base VUs"
                tip={FIELD_HELP.spikeBase}
                value={config.spikeBaseVus}
                min={1}
                max={500}
                disabled={disabled}
                onChange={(n) => onChange({ spikeBaseVus: n })}
              />
              <NumberField
                label="Spike VUs"
                tip={FIELD_HELP.spikePeak}
                value={config.spikePeakVus}
                min={1}
                max={500}
                disabled={disabled}
                onChange={(n) => onChange({ spikePeakVus: n })}
              />
              <NumberField
                label="Spike duration (s)"
                tip={FIELD_HELP.spikeDuration}
                value={config.spikeDurationSec}
                min={1}
                max={300}
                disabled={disabled}
                onChange={(n) => onChange({ spikeDurationSec: n })}
              />
              <NumberField
                label="Recovery (s)"
                tip={FIELD_HELP.recovery}
                value={config.recoveryDurationSec}
                min={1}
                max={300}
                disabled={disabled}
                onChange={(n) => onChange({ recoveryDurationSec: n })}
              />
            </div>
          ) : null}

          {config.testType === "assertions" ? (
            <div
              className={cn(
                "grid grid-cols-2 gap-3 rounded-xl border p-3",
                "border-emerald-500/30 bg-emerald-500/[0.06]",
              )}
            >
              <NumberField
                label="Expected status"
                tip={FIELD_HELP.expectedStatus}
                value={config.expectedStatus}
                min={100}
                max={599}
                disabled={disabled}
                onChange={(n) => onChange({ expectedStatus: n })}
              />
              <NumberField
                label="Max latency (ms)"
                tip={FIELD_HELP.maxLatency}
                value={config.maxLatencyMs}
                min={1}
                max={60000}
                disabled={disabled}
                onChange={(n) => onChange({ maxLatencyMs: n })}
              />
            </div>
          ) : null}

          {config.testType === "soak" ? (
            <p className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Soak keeps a modest load for a long time. Prefer lower VUs and
              longer duration to catch leaks and slow degradation.
            </p>
          ) : null}

          {config.testType === "load" ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Load holds steady traffic — great for baseline p95 and throughput
              before you run stress or spike.
            </p>
          ) : null}

          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                advancedOpen && "rotate-90",
              )}
            />
            Advanced options
          </button>

          {advancedOpen ? (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-3">
              <NumberField
                label="Think time (ms)"
                tip={FIELD_HELP.thinkTime}
                value={config.thinkTimeMs}
                min={0}
                max={10000}
                disabled={disabled}
                onChange={(n) => onChange({ thinkTimeMs: n })}
              />
              <NumberField
                label="Timeout (ms)"
                tip={FIELD_HELP.timeout}
                value={config.timeoutMs}
                min={1000}
                max={120000}
                disabled={disabled}
                onChange={(n) => onChange({ timeoutMs: n })}
              />
              <NumberField
                label="Max concurrency"
                tip={FIELD_HELP.maxConcurrency}
                value={config.maxConcurrency}
                min={1}
                max={100}
                disabled={disabled}
                onChange={(n) => onChange({ maxConcurrency: n })}
              />
              <label className="flex items-center gap-2 text-xs sm:col-span-3">
                <input
                  type="checkbox"
                  checked={config.stopOnBreakingPoint}
                  onChange={(e) =>
                    onChange({ stopOnBreakingPoint: e.target.checked })
                  }
                  disabled={disabled}
                />
                <span className="inline-flex items-center gap-1">
                  Stop when error-rate threshold is exceeded
                  <InfoTip label="Stop on breaking point">
                    {FIELD_HELP.stopOnBreak}
                  </InfoTip>
                </span>
              </label>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p className="text-[11px] text-muted-foreground">
          {canRun
            ? "Ready — results update live while the test runs."
            : "Enter a URL (or Use Active Request) to enable Run."}
        </p>
        <Button
          className="gap-2"
          disabled={!canRun}
          onClick={onRun}
          title={canRun ? "Run test" : "Enter a URL to run"}
        >
          <Play className="h-3.5 w-3.5" />
          Run Test
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <InfoTip label={`About ${label}`}>{tip}</InfoTip>
    </div>
  );
}

function NumberField({
  label,
  tip,
  value,
  onChange,
  min,
  max,
  disabled,
  hint,
}: {
  label: string;
  tip: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} tip={tip} />
      <Input
        type="number"
        className="h-9"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
