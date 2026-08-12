import { useState, type ReactNode } from "react";
import {
  CircleHelp,
  Coffee,
  ExternalLink,
  FolderGit2,
  Info,
  Maximize,
  Menu,
  Minimize2,
  Replace,
  RotateCcw,
  Scale,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppIcon } from "@/components/common/AppIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/hooks/redux";
import { openUrlReplacePanel } from "@/store/thunks/openUrlReplacePanel";
import { useAppZoom } from "@/hooks/useAppZoom";
import { useFullscreen } from "@/hooks/useFullscreen";
import { FISHMAN_LINKS, openExternalUrl } from "@/utils/external-links";
import { formatZoomPercent, modKeyLabel } from "@/utils/zoom";
import { cn } from "@/utils/cn";
import packageJson from "../../../package.json";

type InfoDialog = "about" | "help" | null;

/**
 * Left title-bar app menu (hamburger): Tools, View, About, Help.
 * View submenu holds zoom + fullscreen controls.
 */
export function AppMenu() {
  const dispatch = useAppDispatch();
  const { zoomLevel, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut } =
    useAppZoom();
  const { fullscreen, toggleFullscreen } = useFullscreen();
  const [infoDialog, setInfoDialog] = useState<InfoDialog>(null);
  const mod = modKeyLabel();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-sm",
              "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              "outline-none focus-visible:bg-accent focus-visible:text-foreground",
              "data-[state=open]:bg-accent data-[state=open]:text-foreground",
            )}
            title="Menu"
            aria-label="Application menu"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem
            className="justify-between gap-6 text-xs"
            onSelect={() => void dispatch(openUrlReplacePanel())}
          >
            <span className="flex items-center gap-2">
              <Replace className="h-3.5 w-3.5 opacity-70" />
              Find &amp; Replace URLs…
            </span>
            <ShortcutHint>{mod}+Shift+H</ShortcutHint>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs">
              View
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <DropdownMenuItem
                className="justify-between gap-6 text-xs"
                onSelect={(e) => {
                  e.preventDefault();
                  resetZoom();
                }}
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5 opacity-70" />
                  Reset Zoom
                </span>
                <ShortcutHint>{mod}+0</ShortcutHint>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canZoomIn}
                className="justify-between gap-6 text-xs"
                onSelect={(e) => {
                  e.preventDefault();
                  zoomIn();
                }}
              >
                <span className="flex items-center gap-2">
                  <ZoomIn className="h-3.5 w-3.5 opacity-70" />
                  Zoom In
                </span>
                <ShortcutHint>{mod}++</ShortcutHint>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canZoomOut}
                className="justify-between gap-6 text-xs"
                onSelect={(e) => {
                  e.preventDefault();
                  zoomOut();
                }}
              >
                <span className="flex items-center gap-2">
                  <ZoomOut className="h-3.5 w-3.5 opacity-70" />
                  Zoom Out
                </span>
                <ShortcutHint>{mod}+-</ShortcutHint>
              </DropdownMenuItem>
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                Zoom {formatZoomPercent(zoomLevel)}
                <span className="text-muted-foreground/70"> · 50%–200%</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="justify-between gap-6 text-xs"
                onSelect={() => {
                  void toggleFullscreen();
                }}
              >
                <span className="flex items-center gap-2">
                  {fullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5 opacity-70" />
                  ) : (
                    <Maximize className="h-3.5 w-3.5 opacity-70" />
                  )}
                  {fullscreen ? "Exit Full Screen" : "Full Screen"}
                </span>
                <ShortcutHint>F11</ShortcutHint>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-xs"
            onSelect={() => setInfoDialog("about")}
          >
            <Info className="h-3.5 w-3.5 opacity-70" />
            About
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => setInfoDialog("help")}
          >
            <CircleHelp className="h-3.5 w-3.5 opacity-70" />
            Help
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AboutDialog
        open={infoDialog === "about"}
        onOpenChange={(open) => setInfoDialog(open ? "about" : null)}
      />
      <HelpDialog
        open={infoDialog === "help"}
        onOpenChange={(open) => setInfoDialog(open ? "help" : null)}
      />
    </>
  );
}

function ShortcutHint({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <AppIcon size="md" className="mb-2" />
          <DialogTitle>Fishman</DialogTitle>
          <DialogDescription>
            Native, Git-first API client for building, testing, and documenting
            requests. Local-first — your data stays on your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
            Version {packageJson.version}
          </div>

          <dl className="space-y-2 rounded-md border border-border/60 px-3 py-2.5 text-xs">
            <AboutRow label="Author" value="Narendra Nishad" />
            <AboutRow label="License" value="Apache License 2.0" />
            <AboutRow label="Copyright" value="© 2026 Narendra Nishad" />
          </dl>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Source code is licensed under Apache-2.0. The Fishman name and logo
            are trademarks of Narendra Nishad and are not covered by the code
            license.
          </p>

          <div className="flex flex-col gap-1.5">
            <AboutLinkButton
              icon={FolderGit2}
              label="GitHub repository"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.repo)}
            />
            <AboutLinkButton
              icon={Scale}
              label="View license"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.license)}
            />
            <AboutLinkButton
              icon={Coffee}
              label="Support on Ko-fi"
              onClick={() => void openExternalUrl(FISHMAN_LINKS.koFi)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function AboutLinkButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 w-full justify-between text-xs"
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        {label}
      </span>
      <ExternalLink className="h-3 w-3 opacity-50" />
    </Button>
  );
}

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mod = modKeyLabel();
  const rows = [
    { keys: `${mod}+Enter`, label: "Send request" },
    { keys: `${mod}+S`, label: "Save request" },
    { keys: `${mod}+N`, label: "New request" },
    { keys: `${mod}+W`, label: "Close tab" },
    { keys: `${mod}+Shift+H`, label: "Find & Replace URLs (uses selection)" },
    { keys: `${mod}+\``, label: "Toggle terminal" },
    { keys: `${mod}++`, label: "Zoom in" },
    { keys: `${mod}+-`, label: "Zoom out" },
    { keys: `${mod}+0`, label: "Reset zoom" },
    { keys: "F11", label: "Toggle full screen" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Common shortcuts for Fishman. Zoom stays between 50% and 200%.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[min(50vh,360px)] space-y-1 overflow-y-auto text-sm">
          {rows.map((row) => (
            <li
              key={row.keys}
              className="flex items-center justify-between gap-4 rounded-sm px-2 py-1.5 hover:bg-muted/50"
            >
              <span className="text-foreground/90">{row.label}</span>
              <kbd className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
