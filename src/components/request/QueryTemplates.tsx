import {
  QUERY_TEMPLATES,
  applyRequestTemplate,
  type RequestTemplate,
} from "@/http-methods";
import type { RequestDraft } from "@/types/request";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface QueryTemplatesProps {
  draft: RequestDraft;
  onApply: (changes: Partial<RequestDraft>) => void;
}

export function QueryTemplates({ draft, onApply }: QueryTemplatesProps) {
  if (draft.method !== "QUERY") return null;

  const handleApply = (template: RequestTemplate) => {
    onApply(applyRequestTemplate(draft, template));
  };

  return (
    <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-400">
        <Search className="h-3.5 w-3.5" />
        QUERY templates
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUERY_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-cyan-500/30 text-xs"
            title={template.description}
            onClick={() => handleApply(template)}
          >
            {template.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
