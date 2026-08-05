import { useStore } from "react-redux";
import { Loader2, Plug, PlugZap, RefreshCw, Save, Unplug } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { KeyValueEditor } from "@/components/common/KeyValueEditor";
import { VariableAwareInput } from "@/components/common/VariableAwareInput";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
import { maybeScheduleAutoSaveFromTab } from "@/store/thunks/filesystemAutoSaveThunks";
import type { RootState } from "@/store";
import {
  createDefaultWsConfig,
  type WsConfig,
  type WsMessageTemplate,
} from "@/types/websocket";
import type { KeyValue } from "@/types/request";
import { generateId } from "@/utils/id";
import {
  syncParamsFromUrl,
  syncUrlWithParams,
} from "@/utils/requestBuilder";
import {
  isWebSocketUrl,
  suggestWebSocketUrl,
} from "@/utils/websocket";
import {
  connectWebSocketThunk,
  disconnectWebSocketThunk,
  reconnectWebSocketThunk,
} from "@/store/thunks/websocketThunks";
import { cn } from "@/utils/cn";

interface WsRequestBuilderProps {
  tabId: string;
}

export function WsRequestBuilder({ tabId }: WsRequestBuilderProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const wsTab = useAppSelector((s) => s.websocket.byTab[tabId]);
  const diskChanged = useAppSelector((s) =>
    s.filesystemSync.diskChangedTabIds.includes(tabId),
  );

  if (!draft) return null;

  const ws: WsConfig = draft.websocket ?? createDefaultWsConfig();
  const status = wsTab?.status ?? "idle";
  const isLive = status === "open" || status === "connecting";
  const isConnecting = status === "connecting";
  const urlOk = isWebSocketUrl(draft.url) || Boolean(suggestWebSocketUrl(draft.url));
  const plaintextWarn = /^ws:\/\//i.test(draft.url.trim());

  const markUnsaved = (changes: Parameters<typeof updateDraft>[0]["changes"]) => {
    dispatch(updateDraft({ tabId, changes }));
    dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
    if (changes.name) {
      dispatch(updateTab({ id: tabId, changes: { title: changes.name } }));
    }
    maybeScheduleAutoSaveFromTab(dispatch, store.getState, tabId);
  };

  const patchWs = (partial: Partial<WsConfig>) => {
    markUnsaved({ websocket: { ...ws, ...partial } });
  };

  const hasKeyValueContent = (items: KeyValue[]) =>
    items.some((item) => item.key.trim().length > 0);

  const onUrlChange = (url: string) => {
    const upgraded = suggestWebSocketUrl(url);
    const nextUrl = upgraded ?? url;
    markUnsaved({
      url: nextUrl,
      params: syncParamsFromUrl(nextUrl, draft.params),
    });
  };

  const handleConnect = () => {
    void dispatch(connectWebSocketThunk(tabId));
  };

  const handleDisconnect = () => {
    void dispatch(disconnectWebSocketThunk(tabId));
  };

  const handleReconnect = () => {
    void dispatch(reconnectWebSocketThunk(tabId));
  };

  const addTemplate = () => {
    const template: WsMessageTemplate = {
      id: generateId(),
      name: `Message ${ws.messages.length + 1}`,
      type: ws.messageType,
      body: ws.messageType === "json" ? '{\n  \n}' : "",
    };
    patchWs({ messages: [...ws.messages, template] });
  };

  const updateTemplate = (id: string, changes: Partial<WsMessageTemplate>) => {
    patchWs({
      messages: ws.messages.map((m) =>
        m.id === id ? { ...m, ...changes } : m,
      ),
    });
  };

  const removeTemplate = (id: string) => {
    patchWs({ messages: ws.messages.filter((m) => m.id !== id) });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-600 dark:text-violet-400">
            WS
          </span>
          <VariableAwareInput
            className="h-8 flex-1 font-mono text-xs"
            value={draft.url}
            collectionId={draft.collectionId}
            placeholder="wss://echo.websocket.events"
            onChange={onUrlChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (isLive) handleDisconnect();
                else handleConnect();
              }
            }}
          />
          {isLive ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5"
              disabled={isConnecting}
              onClick={handleDisconnect}
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unplug className="h-3.5 w-3.5" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              disabled={!urlOk}
              title={!urlOk ? "Enter a ws:// or wss:// URL" : "Connect"}
              onClick={handleConnect}
            >
              <Plug className="h-3.5 w-3.5" />
              Connect
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={status === "connecting"}
            title="Reconnect"
            onClick={handleReconnect}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            title="Save (Ctrl+S)"
            onClick={() => void dispatch(saveActiveTab(tabId))}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 px-0.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1",
              status === "open" && "text-emerald-600 dark:text-emerald-400",
              status === "error" && "text-destructive",
            )}
          >
            <PlugZap className="h-3 w-3" />
            {status === "open"
              ? "Connected"
              : status === "connecting"
                ? "Connecting…"
                : status === "error"
                  ? "Error"
                  : "Not connected"}
          </span>
          {plaintextWarn && (
            <span className="text-amber-600 dark:text-amber-400">
              Unencrypted ws:// — prefer wss:// when possible
            </span>
          )}
          {diskChanged && (
            <span className="text-amber-600">Changed on disk</span>
          )}
        </div>
      </div>

      <Tabs defaultValue="params" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-8 w-full justify-start rounded-none border-b bg-transparent px-2">
          <TabsTrigger value="params" className="text-xs">
            Params
            {hasKeyValueContent(draft.params) ? " ·" : ""}
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs">
            Headers
            {hasKeyValueContent(draft.headers) ? " ·" : ""}
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-xs">
            Auth
          </TabsTrigger>
          <TabsTrigger value="messages" className="text-xs">
            Messages
            {ws.messages.length > 0 ? ` (${ws.messages.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="mt-0 min-h-0 flex-1 overflow-auto p-2">
          <KeyValueEditor
            items={draft.params}
            collectionId={draft.collectionId}
            keyPlaceholder="Parameter"
            onChange={(params) => {
              markUnsaved({
                params,
                url: syncUrlWithParams(draft.url, params),
              });
            }}
          />
        </TabsContent>

        <TabsContent value="headers" className="mt-0 min-h-0 flex-1 overflow-auto p-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Handshake headers sent when connecting.
          </p>
          <KeyValueEditor
            items={draft.headers}
            collectionId={draft.collectionId}
            keyPlaceholder="Header"
            onChange={(headers) => markUnsaved({ headers })}
          />
        </TabsContent>

        <TabsContent value="auth" className="mt-0 min-h-0 flex-1 overflow-auto p-2">
          <AuthPanel
            auth={draft.auth}
            onChange={(auth) => markUnsaved({ auth })}
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-0 min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Saved templates for the message composer.
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addTemplate}>
              Add template
            </Button>
          </div>
          {ws.messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No templates yet
            </p>
          ) : (
            <ul className="space-y-2">
              {ws.messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-border/60 p-2"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <input
                      className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                      value={m.name}
                      onChange={(e) =>
                        updateTemplate(m.id, { name: e.target.value })
                      }
                    />
                    <select
                      className="h-7 rounded border border-input bg-background px-1 text-xs"
                      value={m.type}
                      onChange={(e) =>
                        updateTemplate(m.id, {
                          type: e.target.value as WsMessageTemplate["type"],
                        })
                      }
                    >
                      <option value="text">Text</option>
                      <option value="json">JSON</option>
                      <option value="binary">Binary</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => removeTemplate(m.id)}
                    >
                      Remove
                    </Button>
                  </div>
                  <textarea
                    className="min-h-[72px] w-full rounded border border-input bg-background p-2 font-mono text-[11px]"
                    value={m.body}
                    onChange={(e) =>
                      updateTemplate(m.id, { body: e.target.value })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-auto p-3 space-y-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ws.showSystemFrames}
              onChange={(e) =>
                patchWs({ showSystemFrames: e.target.checked })
              }
            />
            Show system / ping / pong frames
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ws.autoReconnect}
              onChange={(e) => patchWs({ autoReconnect: e.target.checked })}
            />
            Auto-reconnect (manual reconnect also available)
          </label>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              Subprotocols (comma-separated)
            </label>
            <input
              className="h-8 w-full rounded border border-input bg-background px-2 font-mono text-xs"
              value={ws.protocols.join(", ")}
              placeholder="graphql-transport-ws"
              onChange={(e) =>
                patchWs({
                  protocols: e.target.value
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
