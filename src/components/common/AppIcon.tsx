import icon32 from "@tauri-icons/32x32.png";
import icon64 from "@tauri-icons/64x64.png";
import icon128 from "@tauri-icons/128x128.png";
import icon256 from "@tauri-icons/128x128@2x.png";
import { cn } from "@/utils/cn";

const ICON_BY_SIZE = {
  xs: icon32,
  sm: icon32,
  md: icon64,
  lg: icon128,
  xl: icon256,
} as const;

const SIZE_CLASS = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
} as const;

export type AppIconSize = keyof typeof ICON_BY_SIZE;

interface AppIconProps {
  size?: AppIconSize;
  className?: string;
  alt?: string;
}

export function AppIcon({
  size = "sm",
  className,
  alt = "Fishman",
}: AppIconProps) {
  return (
    <img
      src={ICON_BY_SIZE[size]}
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
