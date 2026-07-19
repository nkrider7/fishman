import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAppDispatch } from "@/hooks/redux";
import { deleteCookie, deleteCookiesByDomain } from "@/store/slices/cookiesSlice";
import { CookieRow } from "@/components/cookies/CookieRow";
import type { StoredCookie } from "@/types/cookie";
import { cn } from "@/utils/cn";

interface CookieDomainGroupProps {
  domain: string;
  cookies: StoredCookie[];
  onAdd: () => void;
  onEdit: (cookie: StoredCookie) => void;
}

export function CookieDomainGroup({
  domain,
  cookies,
  onAdd,
  onEdit,
}: CookieDomainGroupProps) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(true);

  const handleDeleteDomain = () => {
    const ok = window.confirm(
      `Delete all ${cookies.length} cookie(s) for ${domain}?`,
    );
    if (!ok) return;
    void dispatch(deleteCookiesByDomain(domain));
  };

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card/40">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {domain}{" "}
            <span className="font-normal text-muted-foreground">
              ({cookies.length} cookie{cookies.length === 1 ? "" : "s"})
            </span>
          </span>
        </button>
        <div className="flex items-center gap-0.5">
          <IconButton label={`Add cookie for ${domain}`} onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={`Delete all cookies for ${domain}`}
            onClick={handleDeleteDomain}
            destructive
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </header>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 text-center font-medium">Secure</th>
                <th className="px-3 py-2 text-center font-medium">HTTP Only</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((cookie) => (
                <CookieRow
                  key={cookie.id}
                  cookie={cookie}
                  onEdit={() => onEdit(cookie)}
                  onDelete={() => {
                    const ok = window.confirm(
                      `Delete cookie "${cookie.name}"?`,
                    );
                    if (!ok) return;
                    void dispatch(deleteCookie(cookie.id));
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IconButton({
  children,
  label,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
        destructive && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
