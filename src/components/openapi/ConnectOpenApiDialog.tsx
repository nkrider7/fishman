import { Check, FileJson, Link2, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  checkOpenApiDrift,
  closeConnectOpenApi,
  connectOpenApiSpec,
  pickOpenApiSpecFile,
  setOpenApiSourceMode,
  setOpenApiUrlInput,
} from "@/store/slices/openapiSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

const FEATURES = [
  "Detect new, modified, and removed endpoints",
  "Track local changes against the spec",
  "Sync collection with a single click",
  "Your tests, assertions, and scripts are preserved during sync",
] as const;

export function ConnectOpenApiDialog() {
  const open = useAppSelector((s) => s.openapi.connectOpen);
  if (!open) return null;
  return <ConnectOpenApiDialogOpen />;
}

function ConnectOpenApiDialogOpen() {
  const dispatch = useAppDispatch();
  const {
    sourceMode,
    urlInput,
    fileName,
    filePath,
    connecting,
    error,
    collectionRootId,
  } = useAppSelector((s) => s.openapi);

  const canConnect =
    sourceMode === "url"
      ? urlInput.trim().length > 0
      : Boolean(filePath || fileName);

  const handleClose = () => dispatch(closeConnectOpenApi());

  const handleConnect = async () => {
    const result = await dispatch(connectOpenApiSpec());
    if (connectOpenApiSpec.fulfilled.match(result)) {
      if (!result.payload.createdNew && collectionRootId) {
        void dispatch(checkOpenApiDrift({ collectionRootId }));
      }
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1.5 px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Connect to OpenAPI Spec
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            Keep your collection synchronized with an OpenAPI specification.
            Changes in the spec will be detected automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          <div className="rounded-lg border border-border bg-muted/20 p-3.5">
            <p className="mb-2 text-[12px] font-medium text-foreground">
              OpenAPI Specification
            </p>

            <div className="flex items-stretch gap-1.5">
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border bg-background">
                <button
                  type="button"
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    sourceMode === "url"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => dispatch(setOpenApiSourceMode("url"))}
                >
                  URL
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    sourceMode === "file"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => dispatch(setOpenApiSourceMode("file"))}
                >
                  File
                </button>
              </div>

              {sourceMode === "url" ? (
                <Input
                  value={urlInput}
                  onChange={(e) => dispatch(setOpenApiUrlInput(e.target.value))}
                  placeholder="https://example.com/openapi.json"
                  className="h-8 flex-1 font-mono text-[11px]"
                  disabled={connecting}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canConnect && !connecting) {
                      void handleConnect();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
                  onClick={() => void dispatch(pickOpenApiSpecFile())}
                  disabled={connecting}
                >
                  <FileJson className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{fileName || "Select File"}</span>
                </button>
              )}

              <Button
                size="sm"
                className="h-8 shrink-0 px-3"
                disabled={!canConnect || connecting}
                onClick={() => void handleConnect()}
              >
                {connecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              {sourceMode === "url"
                ? "Enter a public or reachable OpenAPI/Swagger JSON or YAML URL"
                : "Select a local OpenAPI/Swagger JSON or YAML file"}
            </p>

            {error ? (
              <p className="mt-2 text-[11px] text-destructive">{error}</p>
            ) : null}
          </div>

          <ul className="space-y-2">
            {FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-[12px] text-muted-foreground"
              >
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                  aria-hidden
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
