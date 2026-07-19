import { Info } from "lucide-react";
import { MethodSemantics } from "@/components/request/MethodSemantics";
import { getMethodDefinition } from "@/http-methods";

interface MethodDocsPanelProps {
  method: string;
}

export function MethodDocsPanel({ method }: MethodDocsPanelProps) {
  const def = getMethodDefinition(method);
  if (!def) return null;

  return (
    <div className="space-y-3">
      <MethodSemantics method={method} />
      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          About {def.name}
        </div>
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {def.documentation}
        </p>
        {def.name === "QUERY" && (
          <p className="mt-2 text-[11px] text-muted-foreground/80">
            Spec: RFC 10008 — The HTTP QUERY Method
          </p>
        )}
      </div>
    </div>
  );
}
