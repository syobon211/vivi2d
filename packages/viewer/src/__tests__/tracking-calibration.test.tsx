import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  calibrateTrackingChannel,
  createCalibrationEngineState,
  createTrackingSignalFrame,
  makeTrackingChannelId,
  processTrackingSignalFrame,
  resetCalibrationEngineState,
  suggestTrackingChannelCalibration,
} from "../calibration/calibration-engine";
import { TrackingCalibrationPanel } from "../calibration/TrackingCalibrationPanel";
import {
  ViviTrackingCalibrationStore,
  makeTrackingFrameFromChannels,
} from "../calibration/calibration-store";
import {
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
  VIVI_TRACKING_CALIBRATION_VERSION,
  parseTrackingCalibrationProfile,
} from "../calibration/calibration-types";

describe("tracking calibration engine", () => {
  it("filters non-finite values from signal frames", () => {
    const frame = createTrackingSignalFrame("face", {
      mouthOpen: 0.5,
      broken: Number.NaN,
    });

    expect(frame.channels).toEqual({ mouthOpen: 0.5 });
  });

  it("applies neutral, deadzone, curve, invert, clamp, and smoothing", () => {
    const first = calibrateTrackingChannel(0.75, {
      ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
      inputMin: 0,
      inputMax: 1,
      outputMin: 0,
      outputMax: 1,
      neutral: 0.5,
      deadzone: 0.1,
      curve: "easeIn",
      smoothing: 0,
      invert: false,
    });
    const second = calibrateTrackingChannel(
      1,
      {
        ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        smoothing: 0.5,
        invert: true,
      },
      0.8,
    );

    expect(first).toBeCloseTo(0.4225);
    expect(second).toBeCloseTo(0.4);
  });

  it("covers curve variants, degenerate ranges, parameter clamps, and state reset", () => {
    const base = {
      ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
      inputMin: 0,
      inputMax: 1,
      outputMin: 0,
      outputMax: 1,
      deadzone: 0,
      neutral: 0,
      smoothing: 0,
    };
    const state = createCalibrationEngineState();
    state.previousCalibratedValues.face = 1;
    state.previousFallbackValues.face = 1;

    expect(calibrateTrackingChannel(0.25, { ...base, curve: "easeOut" })).toBeCloseTo(
      0.4375,
    );
    expect(
      calibrateTrackingChannel(0.75, { ...base, curve: "easeInOut" }),
    ).toBeCloseTo(0.875);
    expect(calibrateTrackingChannel(0.49, { ...base, curve: "step" })).toBe(0);
    expect(
      calibrateTrackingChannel(0.75, { ...base, curve: "linear" }, undefined, {
        min: 0.2,
        max: 0.5,
      }),
    ).toBe(0.5);
    expect(
      calibrateTrackingChannel(0.75, {
        ...base,
        inputMin: 0.5,
        inputMax: 0.5,
      }),
    ).toBe(0.75);

    resetCalibrationEngineState(state);
    expect(state.previousCalibratedValues).toEqual({});
    expect(state.previousFallbackValues).toEqual({});
    expect(makeTrackingChannelId("face", "mouthOpen")).toBe("face.mouthOpen");
  });

  it("uses calibrated smoothing without applying fallback smoothing twice", () => {
    const state = createCalibrationEngineState();
    const profile = parseTrackingCalibrationProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "test",
      name: "Test",
      channels: {
        "face.mouthOpen": {
          ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          inputMin: 0,
          inputMax: 1,
          outputMin: 0,
          outputMax: 1,
          smoothing: 0.5,
        },
      },
    });

    processTrackingSignalFrame(
      createTrackingSignalFrame("face", { mouthOpen: 0 }),
      profile,
      state,
      { fallbackSmoothing: 0.9 },
    );
    const processed = processTrackingSignalFrame(
      createTrackingSignalFrame("face", { mouthOpen: 1 }),
      profile,
      state,
      { fallbackSmoothing: 0.9 },
    );

    expect(processed.frame.channels.mouthOpen).toBeCloseTo(0.5);
    expect(processed.diagnostics[0]).toMatchObject({ calibrated: true });
  });

  it("does not apply bare channel calibrations across sources", () => {
    const state = createCalibrationEngineState();
    const profile = parseTrackingCalibrationProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "test",
      name: "Test",
      channels: {
        mouthOpen: {
          ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          inputMin: 0,
          inputMax: 1,
          outputMin: 1,
          outputMax: 1,
        },
      },
    });
    const processed = processTrackingSignalFrame(
      createTrackingSignalFrame("lipSync", { mouthOpen: 0.25 }),
      profile,
      state,
    );

    expect(processed.frame.channels.mouthOpen).toBe(0.25);
    expect(processed.diagnostics[0]).toMatchObject({ calibrated: false });
  });

  it("falls back to global smoothing only for uncalibrated channels", () => {
    const state = createCalibrationEngineState();
    processTrackingSignalFrame(
      createTrackingSignalFrame("hand", { handLX: 0 }),
      null,
      state,
      { fallbackSmoothing: 0.5 },
    );
    const processed = processTrackingSignalFrame(
      createTrackingSignalFrame("hand", { handLX: 1 }),
      null,
      state,
      { fallbackSmoothing: 0.5 },
    );

    expect(processed.frame.channels.handLX).toBeCloseTo(0.5);
    expect(processed.diagnostics[0]).toMatchObject({ calibrated: false });
  });

  it("suggests padded input ranges from observed motion", () => {
    const suggested = suggestTrackingChannelCalibration(
      { min: 0.2, max: 0.8, neutral: 0.5 },
      {
        ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
        outputMin: 0,
        outputMax: 1,
        smoothing: 0.25,
      },
    );

    expect(suggested).toMatchObject({
      enabled: true,
      neutral: 0.5,
      outputMin: 0,
      outputMax: 1,
      smoothing: 0.25,
    });
    expect(suggested.inputMin).toBeLessThan(0.2);
    expect(suggested.inputMax).toBeGreaterThan(0.8);
  });

  it("suggests safe fallback ranges when observations are invalid or tiny", () => {
    const previous = {
      ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
      neutral: 0.25,
      outputMin: -1,
      outputMax: 1,
    };

    const invalid = suggestTrackingChannelCalibration(
      { min: Number.NaN, max: Number.POSITIVE_INFINITY },
      previous,
    );
    const tiny = suggestTrackingChannelCalibration(
      { min: 0.1, max: 0.1001, neutral: Number.NaN },
      previous,
    );

    expect(invalid).toMatchObject({ enabled: true, neutral: 0.25 });
    expect(invalid.inputMin).toBeLessThan(0.25);
    expect(invalid.inputMax).toBeGreaterThan(0.25);
    expect(tiny.neutral).toBe(0.25);
    expect(tiny.inputMax - tiny.inputMin).toBeGreaterThan(0.9);
  });

  it("reports clipping and bare-channel parameter range clamps for calibrated frames", () => {
    const state = createCalibrationEngineState();
    const profile = parseTrackingCalibrationProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "test",
      name: "Test",
      channels: {
        "face.mouthOpen": {
          ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          enabled: true,
          inputMin: 0,
          inputMax: 1,
          outputMin: -1,
          outputMax: 1,
          smoothing: 0,
        },
      },
    });

    const processed = processTrackingSignalFrame(
      createTrackingSignalFrame("face", { mouthOpen: 2 }),
      profile,
      state,
      { parameterRanges: { mouthOpen: { min: -0.5, max: 0.5 } } },
    );

    expect(processed.frame.channels.mouthOpen).toBe(0.5);
    expect(processed.diagnostics[0]).toMatchObject({ clipped: true, inputMin: 0 });
  });
});

describe("tracking calibration store", () => {
  it("captures neutral values into the active profile", () => {
    const store = new ViviTrackingCalibrationStore();
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.42 }));

    expect(store.captureNeutral("face")).toBe(true);

    const active = store.activeProfile();
    expect(active?.channels["face.mouthOpen"]?.neutral).toBeCloseTo(0.42);
  });

  it("captures neutral for new channels without implicitly enabling them", () => {
    const store = new ViviTrackingCalibrationStore([]);
    store.setProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "empty",
      name: "Empty",
      channels: {},
    });
    store.applyProfile("empty");
    store.processFrame(createTrackingSignalFrame("platformFace", { custom: 0.3 }));

    expect(store.captureNeutral("platformFace")).toBe(true);

    expect(store.activeProfile()?.channels["platformFace.custom"]).toMatchObject({
      neutral: 0.3,
      enabled: false,
    });
  });

  it("resets engine state when replacing an active profile", () => {
    const store = new ViviTrackingCalibrationStore([]);
    const profile = {
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "profile",
      name: "Profile",
      channels: {
        "face.mouthOpen": {
          ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          inputMin: 0,
          inputMax: 1,
          outputMin: 0,
          outputMax: 1,
          smoothing: 0.5,
        },
      },
    };
    store.setProfile(profile);
    store.applyProfile("profile");
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0 }));
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 1 }));

    store.setProfile(profile);
    const processed = store.processFrame(
      createTrackingSignalFrame("face", { mouthOpen: 1 }),
    );

    expect(processed.channels.mouthOpen).toBe(1);
  });

  it("exports, imports, applies, and resets profiles", () => {
    const store = new ViviTrackingCalibrationStore();
    expect(store.applyProfile("stable")).toBe(true);
    const exported = store.exportConfig();
    const next = new ViviTrackingCalibrationStore();

    next.importConfig(exported);
    expect(next.snapshot().activeProfileId).toBe("stable");
    next.reset();
    expect(next.snapshot().activeProfileId).toBe("balanced");
  });

  it("imports empty configs with builtin fallback and no stale frames", () => {
    const store = new ViviTrackingCalibrationStore([]);
    const exported = store.importConfig({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      activeProfileId: "missing",
      profiles: [],
    });

    expect(exported.profiles.length).toBeGreaterThan(0);
    expect(store.activeProfile()).not.toBeNull();
    expect(store.latestFrame("face")).toBeNull();
  });

  it("clears cached frames when importing calibration config", () => {
    const store = new ViviTrackingCalibrationStore();
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.7 }));
    expect(store.snapshot().diagnostics).not.toHaveLength(0);
    store.importConfig({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      activeProfileId: "empty",
      profiles: [
        {
          version: VIVI_TRACKING_CALIBRATION_VERSION,
          id: "empty",
          name: "Empty",
          channels: {},
        },
      ],
    });

    expect(store.captureNeutral("face")).toBe(false);
    expect(store.snapshot().diagnostics).toHaveLength(0);
  });

  it("tracks observed ranges and applies suggested ranges to the active profile", () => {
    const store = new ViviTrackingCalibrationStore([]);
    store.setProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "custom",
      name: "Custom",
      channels: {},
    });
    store.applyProfile("custom");
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.2 }));
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.8 }));

    expect(store.snapshot().observedRanges[0]).toMatchObject({
      channelId: "face.mouthOpen",
      min: 0.2,
      max: 0.8,
    });
    expect(store.suggestRanges("face")).toBe(true);

    const channel = store.activeProfile()?.channels["face.mouthOpen"];
    expect(channel).toMatchObject({ enabled: true });
    expect(channel?.inputMin).toBeLessThan(0.2);
    expect(channel?.inputMax).toBeGreaterThan(0.8);
    expect(store.snapshot().observedRanges).toHaveLength(0);
  });

  it("clears only the suggested source ranges and keeps other sources", () => {
    const store = new ViviTrackingCalibrationStore([]);
    store.setProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "custom",
      name: "Custom",
      channels: {},
    });
    store.applyProfile("custom");
    store.recordFrame(makeTrackingFrameFromChannels("face", { mouthOpen: 0.1 }));
    store.recordFrame(makeTrackingFrameFromChannels("face", { mouthOpen: 0.9 }));
    store.recordFrame(makeTrackingFrameFromChannels("hand", { handLX: 0.2 }));

    expect(store.suggestRanges("pose")).toBe(false);
    expect(store.suggestRanges("face")).toBe(true);

    expect(store.snapshot().observedRanges.map((range) => range.source)).toEqual([
      "hand",
    ]);
  });

  it("ignores non-finite values when recording observed ranges defensively", () => {
    const store = new ViviTrackingCalibrationStore();
    store.recordFrame({
      source: "face",
      timestamp: Date.now(),
      channels: { bad: Number.NaN },
    });

    expect(store.snapshot().observedRanges).toHaveLength(0);
  });

  it("clears observed ranges when switching profiles", () => {
    const store = new ViviTrackingCalibrationStore();
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.5 }));
    expect(store.snapshot().observedRanges).toHaveLength(1);

    expect(store.applyProfile("stable")).toBe(true);

    expect(store.snapshot().observedRanges).toHaveLength(0);
  });

  it("returns false for missing active profiles and neutral frames", () => {
    const store = new ViviTrackingCalibrationStore([]);

    expect(store.applyProfile("missing")).toBe(false);
    expect(store.captureNeutral("face")).toBe(false);
    expect(store.suggestRanges("face")).toBe(false);
  });

  it("resets a builtin profile without keeping observed calibration ranges", () => {
    const store = new ViviTrackingCalibrationStore();
    store.recordFrame(makeTrackingFrameFromChannels("face", { mouthOpen: 0.7 }));

    store.reset("balanced");

    expect(store.snapshot().observedRanges).toEqual([]);
  });

  it("marks stale and clipped diagnostics for setup feedback", () => {
    const store = new ViviTrackingCalibrationStore([]);
    store.setProfile({
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      id: "clip",
      name: "Clip",
      channels: {
        "face.mouthOpen": {
          ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          inputMin: 0,
          inputMax: 0.5,
          outputMin: 0,
          outputMax: 1,
        },
      },
    });
    store.applyProfile("clip");
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 1 }, Date.now() - 2000));

    expect(store.snapshot().diagnostics[0]).toMatchObject({
      clipped: true,
      stale: true,
      observedMin: 1,
      observedMax: 1,
    });
  });

  it("enriches fresh diagnostics without stale warnings", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const store = new ViviTrackingCalibrationStore();
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.2 }, 9_500));

    expect(store.snapshot().diagnostics[0]).toMatchObject({ stale: false });
    nowSpy.mockRestore();
  });

  it("rejects malformed profiles", () => {
    expect(() =>
      parseTrackingCalibrationProfile({
        version: 1,
        id: "bad",
        name: "Bad",
        channels: {
          "face.mouthOpen": {
            ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
            inputMin: 1,
            inputMax: 1,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      parseTrackingCalibrationProfile(
        JSON.parse(
          `{"version":1,"id":"bad","name":"Bad","channels":{"__proto__":${JSON.stringify(
            DEFAULT_TRACKING_CHANNEL_CALIBRATION,
          )}}}`,
        ),
      ),
    ).toThrow("reserved calibration channel id");
  });
});

describe("TrackingCalibrationPanel", () => {
  it("renders profiles and live diagnostics", () => {
    const store = new ViviTrackingCalibrationStore();
    store.processFrame(createTrackingSignalFrame("face", { mouthOpen: 0.6 }));

    render(
      <TrackingCalibrationPanel
        locale="en"
        snapshot={store.snapshot()}
        onApplyProfile={() => {}}
        onCaptureNeutral={() => {}}
        onSuggestRanges={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByTestId("tracking-calibration-panel")).toBeTruthy();
    expect(screen.getByText(/face.mouthOpen/)).toBeTruthy();
    expect(screen.getByRole("meter", { name: /face\.mouthOpen/ })).toBeTruthy();
  });

  it("localizes calibration controls in Japanese", () => {
    const store = new ViviTrackingCalibrationStore();

    render(
      <TrackingCalibrationPanel
        locale="ja"
        snapshot={store.snapshot()}
        onApplyProfile={() => {}}
        onCaptureNeutral={() => {}}
        onSuggestRanges={() => {}}
        onReset={() => {}}
      />,
    );

    expect(screen.getByText("調整")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "調整プロファイル" })).toBeTruthy();
    expect(screen.getByText("基準取得 顔")).toBeTruthy();
    expect(screen.getByText("ライブトラッキング信号がありません")).toBeTruthy();
  });

  it("renders diagnostic status variants and forwards calibration actions", () => {
    const store = new ViviTrackingCalibrationStore();
    const snapshot = store.snapshot();
    snapshot.diagnostics = [
      {
        channelId: "face.mouthOpen",
        source: "face",
        raw: 0.75,
        value: 0.5,
        calibrated: true,
        inputMin: 0,
        inputMax: 1,
        observedMin: -0.1,
        observedMax: 0.8,
        clipped: true,
        stale: true,
      },
      {
        channelId: "hand.left",
        source: "hand",
        raw: 2,
        value: 0,
        calibrated: false,
        inputMin: 1,
        inputMax: 1,
      },
    ];
    const onApplyProfile = vi.fn();
    const onCaptureNeutral = vi.fn();
    const onSuggestRanges = vi.fn();
    const onReset = vi.fn();

    render(
      <TrackingCalibrationPanel
        locale="en"
        snapshot={snapshot}
        onApplyProfile={onApplyProfile}
        onCaptureNeutral={onCaptureNeutral}
        onSuggestRanges={onSuggestRanges}
        onReset={onReset}
      />,
    );

    expect(screen.getByText("stale clipped calibrated")).toBeTruthy();
    expect(screen.getByText("raw")).toBeTruthy();
    expect(screen.getByText("observed -0.10..0.80")).toBeTruthy();
    expect(
      screen.getByRole("meter", { name: "Calibration meter hand.left" })
        .firstElementChild,
    ).toHaveStyle({ width: "0%" });

    fireEvent.change(screen.getByRole("combobox", { name: "Calibration profile" }), {
      target: { value: snapshot.profiles[1]?.id ?? snapshot.activeProfileId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Neutral face" }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(onApplyProfile).toHaveBeenCalled();
    expect(onCaptureNeutral).toHaveBeenCalledWith("face");
    expect(onSuggestRanges).toHaveBeenCalledWith("hand");
    expect(onReset).toHaveBeenCalled();
  });
});
