import { Coffee, ExternalLink, FolderGit2, Scale } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  persistSettingsPatch,
  setIgnoreSsl,
  setTheme,
  setTimeoutMs,
} from "@/store/slices/settingsSlice";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Theme, WorkspaceLayout } from "@/types/settings";
import { FISHMAN_LINKS, openExternalUrl } from "@/utils/external-links";
import { cn } from "@/utils/cn";
import packageJson from "../../package.json";

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);

  const save = (changes: Parameters<typeof persistSettingsPatch>[0]) => {
    dispatch(persistSettingsPatch(changes));
  };

  return (
    <div className="space-y-6 overflow-auto p-4 pb-10">
      <div>
        <h2 className="mb-4 text-sm font-semibold">Appearance</h2>
        <div className="space-y-2">
          <Label>Theme</Label>
          <Select
            value={settings.theme}
            onValueChange={(v) => {
              dispatch(setTheme(v as Theme));
              save({ theme: v as Theme });
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold">Layout</h2>
        <div className="space-y-2">
          <Label>Request / Response</Label>
          <p className="text-xs text-muted-foreground">
            Choose how the request and response panels are arranged. You can
            also switch from the title bar icons.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <LayoutOption
              selected={settings.workspaceLayout === "vertical"}
              title="Vertical"
              description="Response below"
              onClick={() => save({ workspaceLayout: "vertical" })}
            >
              <LayoutPreview orientation="vertical" />
            </LayoutOption>
            <LayoutOption
              selected={settings.workspaceLayout === "horizontal"}
              title="Horizontal"
              description="Response beside"
              onClick={() => save({ workspaceLayout: "horizontal" })}
            >
              <LayoutPreview orientation="horizontal" />
            </LayoutOption>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold">Network</h2>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Ignore SSL errors</Label>
            <p className="text-xs text-muted-foreground">
              Disable certificate verification (use with caution)
            </p>
          </div>
          <Switch
            checked={settings.ignoreSsl}
            onCheckedChange={(checked) => {
              dispatch(setIgnoreSsl(checked));
              save({ ignoreSsl: checked });
            }}
          />
        </div>
        <div className="mt-3 space-y-2">
          <Label>Request timeout (ms)</Label>
          <Input
            type="number"
            className="w-[200px]"
            value={settings.timeoutMs}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 30000;
              dispatch(setTimeoutMs(val));
              save({ timeoutMs: val });
            }}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold">About</h2>
        <div className="space-y-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Fishman</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Version {packageJson.version} · Native Git-first API client
            </p>
          </div>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Author</dt>
              <dd className="font-medium">Narendra Nishad</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">License</dt>
              <dd className="font-medium">Apache License 2.0</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Copyright</dt>
              <dd className="font-medium">© 2026 Narendra Nishad</dd>
            </div>
          </dl>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Open-source under Apache-2.0. The Fishman name and logo are
            trademarks of Narendra Nishad.
          </p>

          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-between text-xs"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.repo)}
            >
              <span className="flex items-center gap-2">
                <FolderGit2 className="h-3.5 w-3.5 opacity-70" />
                GitHub repository
              </span>
              <ExternalLink className="h-3 w-3 opacity-50" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-between text-xs"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.license)}
            >
              <span className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 opacity-70" />
                View license
              </span>
              <ExternalLink className="h-3 w-3 opacity-50" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 justify-between text-xs"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.koFi)}
            >
              <span className="flex items-center gap-2">
                <Coffee className="h-3.5 w-3.5 opacity-70" />
                Support on Ko-fi
              </span>
              <ExternalLink className="h-3 w-3 opacity-50" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutOption({
  selected,
  title,
  description,
  onClick,
  children,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border bg-background",
      )}
    >
      {children}
      <div>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function LayoutPreview({ orientation }: { orientation: WorkspaceLayout }) {
  const isHorizontal = orientation === "horizontal";
  return (
    <div
      className={cn(
        "flex h-14 w-full overflow-hidden rounded border border-border/80 bg-muted/30 p-1",
        isHorizontal ? "flex-row gap-1" : "flex-col gap-1",
      )}
      aria-hidden
    >
      <div
        className={cn(
          "rounded-sm bg-muted-foreground/25",
          isHorizontal ? "h-full w-[55%]" : "h-[55%] w-full",
        )}
      />
      <div
        className={cn(
          "rounded-sm bg-primary/35",
          isHorizontal ? "h-full flex-1" : "h-auto flex-1 w-full",
        )}
      />
    </div>
  );
}
