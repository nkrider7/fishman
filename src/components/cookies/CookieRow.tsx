import { Check, Pencil, Trash2 } from "lucide-react";
import type { StoredCookie } from "@/types/cookie";
import { formatCookieExpires } from "@/utils/cookies";
import { cn } from "@/utils/cn";

interface CookieRowProps {
  cookie: StoredCookie;
  onEdit: () => void;
  onDelete: () => void;
}

export function CookieRow({ cookie, onEdit, onDelete }: CookieRowProps) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
      <td className="max-w-[140px] truncate px-3 py-2 font-medium text-foreground">
        {cookie.name}
      </td>
      <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">
        <span title={cookie.value}>{cookie.value || "—"}</span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{cookie.path}</td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {formatCookieExpires(cookie.expires)}
      </td>
      <td className="px-3 py-2 text-center">
        <FlagCheck checked={cookie.secure} label="Secure" />
      </td>
      <td className="px-3 py-2 text-center">
        <FlagCheck checked={cookie.httpOnly} label="HTTP Only" />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            title="Edit cookie"
            aria-label={`Edit ${cookie.name}`}
            onClick={onEdit}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete cookie"
            aria-label={`Delete ${cookie.name}`}
            onClick={onDelete}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function FlagCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center",
        checked ? "text-emerald-400" : "text-transparent",
      )}
      title={checked ? label : undefined}
      aria-label={checked ? `${label}: yes` : `${label}: no`}
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}
