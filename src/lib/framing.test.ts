import { describe, expect, it } from "vitest";
import {
  clampFraming,
  DEFAULT_FRAMING,
  isDefaultFraming,
  photoFrame,
  visibleRegion,
  type PhotoFrame,
} from "./framing";

const landscape = (framing: Partial<PhotoFrame> = {}): PhotoFrame => ({
  ...DEFAULT_FRAMING,
  aspectRatio: 4 / 3,
  ...framing,
});

describe("photoFrame", () => {
  it("needs the image's size", () => {
    expect(photoFrame({ ...DEFAULT_FRAMING, widthPx: null, heightPx: null })).toBeNull();
    expect(photoFrame(null)).toBeNull();
    expect(
      photoFrame({ focusXPct: 20, focusYPct: 80, zoomPct: 150, widthPx: 4000, heightPx: 3000 }),
    ).toEqual({ focusXPct: 20, focusYPct: 80, zoomPct: 150, aspectRatio: 4 / 3 });
  });
});

describe("clampFraming", () => {
  it("keeps the point on the photo and the zoom between 1x and 3x, in whole percents", () => {
    expect(clampFraming({ focusXPct: -4, focusYPct: 102.6, zoomPct: 80 })).toEqual({
      focusXPct: 0,
      focusYPct: 100,
      zoomPct: 100,
    });
    expect(clampFraming({ focusXPct: 33.4, focusYPct: 66.6, zoomPct: 999 })).toEqual({
      focusXPct: 33,
      focusYPct: 67,
      zoomPct: 300,
    });
    expect(isDefaultFraming(clampFraming(DEFAULT_FRAMING))).toBe(true);
  });
});

describe("visibleRegion", () => {
  it("without a framing, crops around the centre (as object-fit: cover)", () => {
    // A 4:3 photo in a square: the full height, the middle three quarters of the width.
    const square = visibleRegion(landscape(), 1);
    expect(square.width).toBeCloseTo(0.75);
    expect(square.height).toBeCloseTo(1);
    expect(square.left).toBeCloseTo(0.125);
    expect(square.top).toBeCloseTo(0);
  });

  it("centres the frame on the focus point", () => {
    const square = visibleRegion(landscape({ focusXPct: 40 }), 1);
    expect(square.left + square.width / 2).toBeCloseTo(0.4);
  });

  it("stops at the photo's edges rather than showing past them", () => {
    const square = visibleRegion(landscape({ focusXPct: 5, focusYPct: 95 }), 1);
    expect(square.left).toBe(0);
    expect(square.top).toBe(0);
    // A banner (3:1) of a 4:3 photo: the full width, a strip at the bottom.
    const banner = visibleRegion(landscape({ focusYPct: 95 }), 3);
    expect(banner.width).toBeCloseTo(1);
    expect(banner.top + banner.height).toBeCloseTo(1);
  });

  it("zooms around the point: a bike at the bottom left fills the banner", () => {
    const banner = visibleRegion(landscape({ focusXPct: 20, focusYPct: 85, zoomPct: 250 }), 3);
    expect(banner.width).toBeCloseTo(0.4);
    expect(banner.left).toBeCloseTo(0);
    expect(banner.top + banner.height / 2).toBeCloseTo(0.85);
  });
});
