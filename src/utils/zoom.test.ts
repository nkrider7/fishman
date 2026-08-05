import { describe, expect, it } from "vitest";
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampZoom,
  formatZoomPercent,
  zoomLayoutPercent,
} from "./zoom";

describe("clampZoom", () => {
  it("clamps to min and max", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
  });

  it("rounds to one decimal to avoid float drift", () => {
    expect(clampZoom(1 + ZOOM_STEP + ZOOM_STEP)).toBe(1.2);
    expect(clampZoom(0.899999)).toBe(0.9);
  });

  it("keeps default unchanged", () => {
    expect(clampZoom(ZOOM_DEFAULT)).toBe(1);
  });
});

describe("formatZoomPercent", () => {
  it("formats as whole percent", () => {
    expect(formatZoomPercent(1)).toBe("100%");
    expect(formatZoomPercent(1.5)).toBe("150%");
    expect(formatZoomPercent(0.5)).toBe("50%");
  });
});

describe("zoomLayoutPercent", () => {
  it("expands layout so zoomed root still fills the viewport", () => {
    expect(zoomLayoutPercent(1)).toBe(100);
    expect(zoomLayoutPercent(0.8)).toBe(125);
    expect(zoomLayoutPercent(0.5)).toBe(200);
    expect(zoomLayoutPercent(2)).toBe(50);
  });
});

