import { useEffect, useState } from "react";
import type { CookieInput, CookieSameSite, StoredCookie } from "@/types/cookie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CookieFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cookie: StoredCookie | null;
  defaultDomain?: string;
  onSubmit: (input: CookieInput) => Promise<unknown>;
}

interface FormState {
  domain: string;
  name: string;
  value: string;
  path: string;
  expires: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: CookieSameSite | "none";
}

function toFormState(
  cookie: StoredCookie | null,
  defaultDomain?: string,
): FormState {
  if (cookie) {
    return {
      domain: cookie.domain,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      expires: cookie.expires
        ? new Date(cookie.expires).toISOString().slice(0, 16)
        : "",
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite ?? "none",
    };
  }
  return {
    domain: defaultDomain ?? "",
    name: "",
    value: "",
    path: "/",
    expires: "",
    secure: false,
    httpOnly: false,
    sameSite: "none",
  };
}

export function CookieFormDialog({
  open,
  onOpenChange,
  cookie,
  defaultDomain,
  onSubmit,
}: CookieFormDialogProps) {
  const [form, setForm] = useState<FormState>(() =>
    toFormState(cookie, defaultDomain),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toFormState(cookie, defaultDomain));
      setError(null);
    }
  }, [open, cookie, defaultDomain]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = form.domain.trim();
    const name = form.name.trim();
    if (!domain) {
      setError("Domain is required");
      return;
    }
    if (!name) {
      setError("Name is required");
      return;
    }

    let expires: string | null = null;
    if (form.expires) {
      const date = new Date(form.expires);
      if (Number.isNaN(date.getTime())) {
        setError("Invalid expiration date");
        return;
      }
      expires = date.toISOString();
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        id: cookie?.id,
        domain,
        name,
        value: form.value,
        path: form.path.trim() || "/",
        expires,
        secure: form.secure,
        httpOnly: form.httpOnly,
        sameSite: form.sameSite === "none" ? null : form.sameSite,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cookie");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cookie ? "Edit Cookie" : "Add Cookie"}</DialogTitle>
          <DialogDescription>
            Cookies are stored locally and sent with matching requests.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cookie-domain">Domain</Label>
            <Input
              id="cookie-domain"
              value={form.domain}
              onChange={(e) => update("domain", e.target.value)}
              placeholder="example.com or .example.com"
              autoFocus={!cookie}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cookie-name">Name</Label>
            <Input
              id="cookie-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="session_id"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cookie-value">Value</Label>
            <Input
              id="cookie-value"
              value={form.value}
              onChange={(e) => update("value", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cookie-path">Path</Label>
              <Input
                id="cookie-path"
                value={form.path}
                onChange={(e) => update("path", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cookie-expires">Expires</Label>
              <Input
                id="cookie-expires"
                type="datetime-local"
                value={form.expires}
                onChange={(e) => update("expires", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>SameSite</Label>
            <Select
              value={form.sameSite}
              onValueChange={(v) =>
                update("sameSite", v as FormState["sameSite"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                <SelectItem value="Lax">Lax</SelectItem>
                <SelectItem value="Strict">Strict</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="cookie-secure">Secure</Label>
            <Switch
              id="cookie-secure"
              checked={form.secure}
              onCheckedChange={(v) => update("secure", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="cookie-httponly">HTTP Only</Label>
            <Switch
              id="cookie-httponly"
              checked={form.httpOnly}
              onCheckedChange={(v) => update("httpOnly", v)}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : cookie ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
