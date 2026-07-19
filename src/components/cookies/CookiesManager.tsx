import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CookieDomainGroup } from "@/components/cookies/CookieDomainGroup";
import { CookieFormDialog } from "@/components/cookies/CookieFormDialog";
import { groupCookiesByDomain } from "@/utils/cookies";
import type { StoredCookie } from "@/types/cookie";
import { upsertCookie } from "@/store/slices/cookiesSlice";

export function CookiesManager() {
  const dispatch = useAppDispatch();
  const cookies = useAppSelector((s) => s.cookies.cookies);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoredCookie | null>(null);
  const [prefillDomain, setPrefillDomain] = useState<string | undefined>();

  const groups = useMemo(() => {
    const all = groupCookiesByDomain(cookies);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((g) => g.domain.toLowerCase().includes(q));
  }, [cookies, search]);

  const openAdd = (domain?: string) => {
    setEditing(null);
    setPrefillDomain(domain);
    setFormOpen(true);
  };

  const openEdit = (cookie: StoredCookie) => {
    setEditing(cookie);
    setPrefillDomain(undefined);
    setFormOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3 pr-12">
        <h2 className="text-sm font-semibold text-foreground">Cookies</h2>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by domain"
            className="h-8 w-[220px] text-xs"
            aria-label="Search cookies by domain"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1"
            onClick={() => openAdd()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Cookie
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {groups.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">
              {cookies.length === 0
                ? "No cookies yet. Send a request or add one manually."
                : "No domains match your search."}
            </p>
            {cookies.length === 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openAdd()}
              >
                Add Cookie
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <CookieDomainGroup
                key={group.domain}
                domain={group.domain}
                cookies={group.cookies}
                onAdd={() => openAdd(group.domain)}
                onEdit={openEdit}
              />
            ))}
          </div>
        )}
      </div>

      <CookieFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        cookie={editing}
        defaultDomain={prefillDomain}
        onSubmit={async (input) => {
          await dispatch(upsertCookie(input));
          setFormOpen(false);
        }}
      />
    </div>
  );
}
