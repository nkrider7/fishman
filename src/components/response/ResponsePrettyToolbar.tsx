import { Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ResponseBodyViewState } from "@/hooks/useResponseBodyView";
import { RESPONSE_FORMAT_OPTIONS } from "@/utils/responseFormat";

interface ResponsePrettyToolbarProps {
  view: ResponseBodyViewState;
}

export function ResponsePrettyToolbar({ view }: ResponsePrettyToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Select value={view.format} onValueChange={view.handleFormatChange}>
        <SelectTrigger className="h-6 w-[92px] border-border/50 bg-transparent px-2 text-[11px] shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESPONSE_FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {view.isHtml && (
        <label
          htmlFor="html-preview-toggle"
          className="flex h-5 cursor-pointer items-center gap-1 rounded border border-border/50 px-1.5 text-[10px] text-muted-foreground"
        >
          <Eye className="h-3 w-3" />
          Preview
          <Switch
            id="html-preview-toggle"
            checked={view.previewEnabled}
            onCheckedChange={view.setPreviewEnabled}
            className="scale-75 data-[state=checked]:bg-amber-600"
          />
        </label>
      )}
    </div>
  );
}
