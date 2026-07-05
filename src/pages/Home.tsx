import { AppIcon } from "@/components/common/AppIcon";

export function HomePage() {
  return (
    <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center text-center">
        <div className="rounded-2xl bg-muted/30 p-5 ring-1 ring-border/60">
          <AppIcon size="lg" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-foreground">Fishman</h1>
        <p className="mt-2">Modern API client for developers</p>
        <p className="mt-1 text-sm">Open or create a request to get started</p>
      </div>
    </div>
  );
}
