/** App-wide UI zoom limits and helpers (factor, where 1 = 100%). */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

/** Clamp and round to one decimal to avoid float drift (0.1 + 0.2 …). */
export function clampZoom(level: number): number {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
  return Math.round(clamped * 10) / 10;
}

export function formatZoomPercent(level: number): string {
  return `${Math.round(clampZoom(level) * 100)}%`;
}

/**
 * Layout size (%) so a scaled `#root` still fills the viewport visually.
 * At 0.8 zoom → 125% layout → scales down to 100% of the window.
 */
export function zoomLayoutPercent(level: number): number {
  const next = clampZoom(level);
  return Math.round((100 / next) * 10000) / 10000;
}

function clearZoomStyles(
  html: HTMLElement,
  body: HTMLElement | null,
  root: HTMLElement | null,
): void {
  html.style.removeProperty("transform");
  html.style.removeProperty("transform-origin");
  html.style.removeProperty("width");
  html.style.removeProperty("height");
  if (body) {
    body.style.removeProperty("transform");
    body.style.removeProperty("transform-origin");
  }
  if (root) {
    root.style.removeProperty("transform");
    root.style.removeProperty("transform-origin");
    root.style.removeProperty("width");
    root.style.removeProperty("height");
  }
}

/**
 * Apply app-wide zoom via standards-based `transform: scale(...)` on `#root`.
 * This avoids cross-engine quirks of CSS `zoom` (especially Linux WebKitGTK),
 * while keeping portal overlays (Radix/Floating UI on body) correctly anchored.
 *
 * @see https://github.com/floating-ui/floating-ui/issues/3032
 */
export function applyDocumentZoom(level: number): void {
  const next = clampZoom(level);
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");

  clearZoomStyles(html, body, root);

  if (next === 1) {
    window.dispatchEvent(new Event("resize"));
    return;
  }

  if (!root) {
    // Fallback path outside app shell.
    html.style.transformOrigin = "top left";
    html.style.transform = `scale(${next})`;
    const layoutPct = `${zoomLayoutPercent(next)}%`;
    html.style.width = layoutPct;
    html.style.height = layoutPct;
  } else {
    const layoutPct = `${zoomLayoutPercent(next)}%`;
    root.style.transformOrigin = "top left";
    root.style.transform = `scale(${next})`;
    root.style.width = layoutPct;
    root.style.height = layoutPct;
  }

  // Nudge layout-dependent widgets (Monaco, xterm FitAddon, resizable panels).
  window.dispatchEvent(new Event("resize"));
}

export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  );
}

/** Shortcut modifier label for menus (⌘ on macOS, Ctrl elsewhere). */
export function modKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}
