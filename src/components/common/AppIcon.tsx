import { useEffect, useState } from "react";
import icon32 from "@tauri-icons/32x32.png";
import icon64 from "@tauri-icons/64x64.png";
import icon128 from "@tauri-icons/128x128.png";
import icon256 from "@tauri-icons/128x128@2x.png";
import textlogoLight from "@/assets/txtlogo.png";
import textlogoDark from "@/assets/txtlogodark.png";
import circle from "@/assets/fishmansunoverlay.png";
import { useAppSelector } from "@/hooks/redux";
import { cn } from "@/utils/cn";

const ICON_BY_SIZE = {
  xs: icon32,
  sm: icon32,
  md: icon64,
  lg: icon128,
  xl: icon256,
  textlogo: textlogoLight,
  circle: circle,
} as const;

const SIZE_CLASS = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
  textlogo: "h-18 w-18",
  circle: "h-6 w-6",
} as const;

export type AppIconSize = keyof typeof ICON_BY_SIZE;

interface AppIconProps {
  size?: AppIconSize;
  className?: string;
  alt?: string;
}

function useIsDarkTheme(): boolean {
  const theme = useAppSelector((s) => s.settings.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemDark;
}

export function AppIcon({
  size = "sm",
  className,
  alt = "Fishman",
}: AppIconProps) {
  const isDark = useIsDarkTheme();
  const src =
    size === "textlogo"
      ? isDark
        ? textlogoLight
        : textlogoDark
      : ICON_BY_SIZE[size];

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn(
        "shrink-0 select-none object-contain",
        SIZE_CLASS[size],
        className,
      )}
    />
  );
}
