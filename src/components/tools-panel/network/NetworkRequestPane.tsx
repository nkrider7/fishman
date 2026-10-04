import type { NetworkLogEntry } from "@/store/slices/networkLogSlice";
import { Input } from "@/components/ui/input";
import { HeadersTable } from "./HeadersTable";

interface NetworkRequestPaneProps {
  entry: NetworkLogEntry;
}

export function NetworkRequestPane({ entry }: NetworkRequestPaneProps) {
  const displayUrl = entry.finalUrl && entry.finalUrl !== entry.url
    ? entry.finalUrl
    : entry.url;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          General
        </h4>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Request URL
            </label>
            <Input
              readOnly
              value={displayUrl}
              className="h-7 font-mono text-[11px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Request Method
            </label>
            <Input
              readOnly
              value={entry.method.toUpperCase()}
              className="h-7 w-28 font-mono text-[11px] uppercase"
            />
          </div>
        </div>
      </section>

      {entry.requestBody ? (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Request Body
          </h4>
          <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
            {entry.requestBody}
          </pre>
        </section>
      ) : null}

      <section className="min-h-0 flex-1">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Request Headers
        </h4>
        <div className="overflow-auto rounded-md border border-border/60">
          <HeadersTable
            headers={entry.requestHeaders ?? {}}
            emptyMessage="No request headers captured"
          />
        </div>
      </section>
    </div>
  );
}
