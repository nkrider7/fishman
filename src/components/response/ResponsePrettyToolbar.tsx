import { Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
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
    <div className="flex shrink-0 items-center gap-2">
      <Select value={view.format} onValueChange={view.handleFormatChange}>
        <SelectTrigger className="h-8 w-[108px] border-border/60 bg-background/80 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESPONSE_FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {view.isHtml && (
        <div className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <Label
            htmlFor="html-preview-toggle"
            className="cursor-pointer text-xs font-medium text-muted-foreground"
          >
            Preview
          </Label>
          <Switch
            id="html-preview-toggle"
            checked={view.previewEnabled}
            onCheckedChange={view.setPreviewEnabled}
            className="data-[state=checked]:bg-amber-600"
          />
        </div>
      )}
    </div>
  );
}
