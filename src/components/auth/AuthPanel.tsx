import type { AuthConfig, AuthType } from "@/types/request";
import { VariableAwareInput } from "@/components/common/VariableAwareInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuthPanelProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
  collectionId?: string | null;
  /** When false, hide the Inherit option (used on folder settings). Default true when collectionId set. */
  allowInherit?: boolean;
}

const BASE_AUTH_TYPES: { value: AuthType; label: string; disabled?: boolean }[] =
  [
    { value: "none", label: "None" },
    { value: "inherit", label: "Inherit" },
    { value: "bearer", label: "Bearer Token" },
    { value: "apikey", label: "API Key" },
    { value: "basic", label: "Basic Auth" },
    { value: "oauth2", label: "OAuth 2.0", disabled: true },
    { value: "jwt", label: "JWT" },
    { value: "custom", label: "Custom Header" },
  ];

function SecretOrVariableInput({
  value,
  onChange,
  placeholder,
  collectionId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  collectionId?: string | null;
}) {
  if (value.includes("{{")) {
    return (
      <VariableAwareInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        collectionId={collectionId}
      />
    );
  }

  return (
    <Input
      type="password"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function AuthPanel({
  auth,
  onChange,
  collectionId = null,
  allowInherit,
}: AuthPanelProps) {
  const showInherit =
    allowInherit !== false && (allowInherit === true || Boolean(collectionId));

  const authTypes = BASE_AUTH_TYPES.filter(
    (t) => t.value !== "inherit" || showInherit,
  );

  const setType = (type: AuthType) => {
    onChange({ type });
  };

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={auth.type} onValueChange={(v) => setType(v as AuthType)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {authTypes.map((t) => (
              <SelectItem key={t.value} value={t.value} disabled={t.disabled}>
                {t.label}
                {t.disabled ? " (Phase 3)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {auth.type === "inherit" && (
          <p className="text-[11px] text-muted-foreground">
            Uses authentication from the parent collection or folder.
          </p>
        )}
      </div>

      {auth.type === "bearer" && (
        <div className="space-y-2">
          <Label>Token</Label>
          <SecretOrVariableInput
            value={auth.bearer?.token ?? ""}
            placeholder="Bearer token or {{token}}"
            collectionId={collectionId}
            onChange={(token) =>
              onChange({ type: "bearer", bearer: { token } })
            }
          />
        </div>
      )}

      {auth.type === "basic" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Username</Label>
            <VariableAwareInput
              value={auth.basic?.username ?? ""}
              collectionId={collectionId}
              placeholder="Username or {{user}}"
              onChange={(username) =>
                onChange({
                  type: "basic",
                  basic: {
                    username,
                    password: auth.basic?.password ?? "",
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <SecretOrVariableInput
              value={auth.basic?.password ?? ""}
              placeholder="Password or {{pass}}"
              collectionId={collectionId}
              onChange={(password) =>
                onChange({
                  type: "basic",
                  basic: {
                    username: auth.basic?.username ?? "",
                    password,
                  },
                })
              }
            />
          </div>
        </div>
      )}

      {auth.type === "apikey" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Key</Label>
              <VariableAwareInput
                value={auth.apikey?.key ?? ""}
                collectionId={collectionId}
                onChange={(key) =>
                  onChange({
                    type: "apikey",
                    apikey: {
                      key,
                      value: auth.apikey?.value ?? "",
                      addTo: auth.apikey?.addTo ?? "header",
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <VariableAwareInput
                value={auth.apikey?.value ?? ""}
                collectionId={collectionId}
                placeholder="Value or {{api_key}}"
                onChange={(val) =>
                  onChange({
                    type: "apikey",
                    apikey: {
                      key: auth.apikey?.key ?? "",
                      value: val,
                      addTo: auth.apikey?.addTo ?? "header",
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Add to</Label>
            <Select
              value={auth.apikey?.addTo ?? "header"}
              onValueChange={(v) =>
                onChange({
                  type: "apikey",
                  apikey: {
                    key: auth.apikey?.key ?? "",
                    value: auth.apikey?.value ?? "",
                    addTo: v as "header" | "query",
                  },
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Params</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {auth.type === "jwt" && (
        <div className="space-y-2">
          <Label>JWT Token</Label>
          <SecretOrVariableInput
            value={auth.jwt?.token ?? ""}
            placeholder="JWT or {{jwt_token}}"
            collectionId={collectionId}
            onChange={(token) =>
              onChange({ type: "jwt", jwt: { token } })
            }
          />
        </div>
      )}

      {auth.type === "custom" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Header Name</Label>
            <VariableAwareInput
              value={auth.custom?.key ?? ""}
              collectionId={collectionId}
              onChange={(key) =>
                onChange({
                  type: "custom",
                  custom: {
                    key,
                    value: auth.custom?.value ?? "",
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Header Value</Label>
            <VariableAwareInput
              value={auth.custom?.value ?? ""}
              collectionId={collectionId}
              placeholder="Value or {{variable}}"
              onChange={(val) =>
                onChange({
                  type: "custom",
                  custom: {
                    key: auth.custom?.key ?? "",
                    value: val,
                  },
                })
              }
            />
          </div>
        </div>
      )}

      {auth.type === "oauth2" && (
        <p className="text-sm text-muted-foreground">
          OAuth 2.0 flow coming in Phase 3.
        </p>
      )}
    </div>
  );
}
