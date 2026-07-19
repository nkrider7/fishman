import fishmanOverlay from "@/assets/fishmansunoverlay.png";
import sunLogo from "@/assets/sun.svg";
import { cn } from "@/utils/cn";

interface BrandLoadingScreenProps {
  message?: string;
  submessage?: string;
  className?: string;
  fullScreen?: boolean;
}

export function BrandLoadingScreen({
  message = "Fishman",
  submessage = "Starting up…",
  className,
  fullScreen = true,
}: BrandLoadingScreenProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] text-foreground",
        fullScreen ? "fixed inset-0 z-[9999]" : "h-full w-full min-h-[200px]",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Soft brand glow */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(204,28,57,0.14)_0%,transparent_55%)]"
      /> */}

      <div className="brand-splash-enter relative z-10 flex flex-col items-center">
        <div
          className="relative h-16 w-16 shrink-0 "
          role="img"
          aria-label="Fishman"
        >
          <img
            src={sunLogo}
            alt=""
            aria-hidden
            draggable={false}
            className="brand-splash-sun absolute inset-0 m-auto h-full w-full select-none object-contain"
          />
          <img
            src={fishmanOverlay}
            alt=""
            aria-hidden
            draggable={false}
            className="brand-splash-mark absolute inset-0 m-auto h-[90%] w-[90%] select-none object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          />
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-wide text-neutral-100">
          {message}
        </h1>
        {submessage ? (
          <p className="mt-1.5 text-sm text-neutral-500">{submessage}</p>
        ) : null}

        <div
          className="brand-splash-track mt-6 h-0.5 w-28 overflow-hidden rounded-full bg-white/10"
          aria-hidden
        >
          <div className="brand-splash-bar h-full w-1/2 rounded-full bg-gradient-to-r from-[#cc1c39]/40 via-[#e85a4f] to-[#cc1c39]/40" />
        </div>
      </div>
    </div>
  );
}
