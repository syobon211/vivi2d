import { describe, expect, it } from "vitest";
import { TRACKING_COUNTS, UI_TIMING, VIEWER_DEFAULTS } from "../constants";


describe("VIEWER_DEFAULTS", () => {
  it("SMOOTHING が 0..1 の範囲内", () => {
    expect(VIEWER_DEFAULTS.SMOOTHING).toBeGreaterThanOrEqual(0);
    expect(VIEWER_DEFAULTS.SMOOTHING).toBeLessThanOrEqual(1);
  });

  it("SMOOTHING_MIN < SMOOTHING < SMOOTHING_MAX", () => {
    expect(VIEWER_DEFAULTS.SMOOTHING_MIN).toBeLessThan(VIEWER_DEFAULTS.SMOOTHING);
    expect(VIEWER_DEFAULTS.SMOOTHING).toBeLessThan(VIEWER_DEFAULTS.SMOOTHING_MAX);
  });

  it("SMOOTHING_STEP が正の値", () => {
    expect(VIEWER_DEFAULTS.SMOOTHING_STEP).toBeGreaterThan(0);
  });
});

describe("UI_TIMING", () => {
  it("HIT_DISPLAY_MS が正の値", () => {
    expect(UI_TIMING.HIT_DISPLAY_MS).toBeGreaterThan(0);
  });

  it("PRESET_DISPLAY_MS が正の値", () => {
    expect(UI_TIMING.PRESET_DISPLAY_MS).toBeGreaterThan(0);
  });

  it("HUD_UPDATE_INTERVAL が正の値", () => {
    expect(UI_TIMING.HUD_UPDATE_INTERVAL).toBeGreaterThan(0);
  });
});

describe("TRACKING_COUNTS", () => {
  it("FACE が 9", () => {
    expect(TRACKING_COUNTS.FACE).toBe(9);
  });

  it("HAND が 6", () => {
    expect(TRACKING_COUNTS.HAND).toBe(6);
  });

  it("POSE が 5", () => {
    expect(TRACKING_COUNTS.POSE).toBe(5);
  });
});
