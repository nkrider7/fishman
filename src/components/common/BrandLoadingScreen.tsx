import { AppIcon } from "@/components/common/AppIcon";
import { cn } from "@/utils/cn";

interface BrandLoadingScreenProps {
  message?: string;
  submessage?: string;
  className?: string;
  fullScreen?: boolean;
}

export function BrandLoadingScreen({
  message = "Fishman",
  submessage = "Loading...",
  className,
  fullScreen = true,
}: BrandLoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-[#0a0a0a] text-foreground",
        fullScreen ? "fixed inset-0 z-[9999]" : "h-full w-full",
        className,
      )}
    >
      <AppIcon size="lg" />
      <h1 className="mt-4 text-lg font-semibold text-neutral-200">{message}</h1>
      <p className="mt-1 text-sm text-neutral-500">{submessage}</p>
    </div>
  );
}
