import { Loader2, RefreshCw, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GraphQLSchemaCacheEntry } from "@/graphql";

interface GraphQLSchemaToolbarProps {
  schema: GraphQLSchemaCacheEntry | null;
  loading: boolean;
  error: string | null;
  docsOpen: boolean;
  onFetch: () => void;
  onToggleDocs: () => void;
}

export function GraphQLSchemaToolbar({
  schema,
  loading,
  error,
  docsOpen,
  onFetch,
  onToggleDocs,
}: GraphQLSchemaToolbarProps) {
  const status = schema
    ? `${schema.typeCount} types · fetched ${formatRelative(schema.fetchedAt)}`
    : "No schema loaded";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={loading}
        onClick={onFetch}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {schema ? "Refresh schema" : "Fetch schema"}
      </Button>
      <Button
        type="button"
        variant={docsOpen ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={onToggleDocs}
        aria-pressed={docsOpen}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Docs
      </Button>
      <span
        className={`text-[11px] ${error ? "text-destructive" : "text-muted-foreground"}`}
        title={error ?? status}
      >
        {error ?? status}
      </span>
    </div>
  );
}

function formatRelative(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}
