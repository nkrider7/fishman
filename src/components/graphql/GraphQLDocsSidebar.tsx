import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fieldInsertSnippet,
  formatTypeRef,
  searchGraphQLDocs,
  type GraphQLDocField,
  type GraphQLDocsModel,
} from "@/graphql";
import { cn } from "@/utils/cn";

interface GraphQLDocsSidebarProps {
  docs: GraphQLDocsModel | null;
  onInsert: (text: string) => void;
  className?: string;
}

export function GraphQLDocsSidebar({
  docs,
  onInsert,
  className,
}: GraphQLDocsSidebarProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => (docs ? searchGraphQLDocs(docs, query) : null),
    [docs, query],
  );

  if (!docs || !filtered) {
    return (
      <aside
        className={cn(
          "flex w-64 shrink-0 flex-col border-l border-border/60 bg-muted/20",
          className,
        )}
      >
        <div className="border-b border-border/50 px-3 py-2 text-xs font-medium">
          Schema docs
        </div>
        <p className="p-3 text-xs text-muted-foreground">
          Fetch the schema to browse queries, mutations, and types.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col border-l border-border/60 bg-muted/20",
        className,
      )}
      aria-label="GraphQL schema documentation"
    >
      <div className="border-b border-border/50 px-3 py-2">
        <div className="mb-2 text-xs font-medium">Schema docs</div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search schema…"
          className="h-8 text-xs"
          aria-label="Search GraphQL schema"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-2 pb-6">
          <DocSection
            title="Queries"
            fields={filtered.queries}
            onInsert={onInsert}
          />
          <DocSection
            title="Mutations"
            fields={filtered.mutations}
            onInsert={onInsert}
          />
          <div>
            <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Subscriptions
            </div>
            <p className="px-1 text-[11px] text-muted-foreground">
              Coming with WebSocket support.
              {filtered.subscriptions.length > 0
                ? ` (${filtered.subscriptions.length} in schema)`
                : ""}
            </p>
          </div>
          <div>
            <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Types
            </div>
            <ul className="space-y-0.5">
              {filtered.types.slice(0, 80).map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                    title={t.description ?? undefined}
                    onClick={() => onInsert(t.name)}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {t.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function DocSection({
  title,
  fields,
  onInsert,
}: {
  title: string;
  fields: GraphQLDocField[];
  onInsert: (text: string) => void;
}) {
  return (
    <div>
      <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {fields.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-0.5">
          {fields.map((f) => (
            <li key={f.name}>
              <button
                type="button"
                className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                title={f.description ?? undefined}
                onClick={() => onInsert(fieldInsertSnippet(f))}
              >
                <div className="font-medium">{f.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {formatTypeRef(f.type)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
