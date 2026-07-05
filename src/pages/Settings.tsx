import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  persistSettings,
  setIgnoreSsl,
  setTheme,
  setTimeoutMs,
} from "@/store/slices/settingsSlice";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppSettings, Theme } from "@/types/settings";

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);

  const save = (changes: Partial<AppSettings>) => {
    const next: AppSettings = { ...settings, ...changes };
    dispatch(persistSettings(next));
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
    </div>
  );
}
