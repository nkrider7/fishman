import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CODEGEN_LANGUAGES,
  getLanguage,
  type CodegenLanguage,
} from "@/codegen";
import { cn } from "@/utils/cn";

interface CodegenToolbarProps {
  languageId: string;
  clientId: string;
  interpolateVariables: boolean;
  onLanguageChange: (languageId: string) => void;
  onClientChange: (clientId: string) => void;
  onInterpolateChange: (value: boolean) => void;
}

export function CodegenToolbar({
  languageId,
  clientId,
  interpolateVariables,
  onLanguageChange,
  onClientChange,
  onInterpolateChange,
}: CodegenToolbarProps) {
  const language: CodegenLanguage | undefined = getLanguage(languageId);
  const clients = language?.clients ?? [];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={languageId} onValueChange={onLanguageChange}>
        <SelectTrigger className="w-[140px]" aria-label="Language">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          {CODEGEN_LANGUAGES.map((lang) => (
            <SelectItem key={lang.id} value={lang.id}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div
        role="group"
        aria-label="Client library"
        className="flex flex-wrap items-center gap-1"
      >
        {clients.map((client) => (
          <Button
            key={client.id}
            type="button"
            size="sm"
            variant={clientId === client.id ? "default" : "outline"}
            className={cn(
              "h-8 px-2.5 text-xs font-medium",
              clientId === client.id && "shadow-sm",
            )}
            onClick={() => onClientChange(client.id)}
            aria-pressed={clientId === client.id}
          >
            {client.label}
          </Button>
        ))}
      </div>

      <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={interpolateVariables}
          onCheckedChange={(v) => onInterpolateChange(v === true)}
          aria-label="Interpolate Variables"
        />
        <span>Interpolate Variables</span>
      </label>
    </div>
  );
}
