import type { ParameterDefinition } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRACKING_COUNTS, VIEWER_DEFAULTS } from "../constants";
import { applyLocalePreference, createT, detectLocale } from "../i18n";
import {
  autoDetectHandMapping,
  autoDetectMapping,
  autoDetectPoseMapping,
} from "../tracking/auto-mapper";
import type { TrackingParameterMap } from "../tracking/face-mapper";
import { mapLandmarksToParams, trackingResultToParams } from "../tracking/face-mapper";
import {
  handTrackingResultToParams,
  mapHandDetectionsToParams,
} from "../tracking/hand-mapper";
import {
  mapPoseLandmarksToParams,
  poseTrackingResultToParams,
} from "../tracking/pose-mapper";


describe("i18n + constants 統合", () => {
  it("定数のTRACKING_COUNTSとauto-mapper結果の最大値が一致する", () => {
    const params: ParameterDefinition[] = [
      { id: "p1", name: "ParamEyeLOpen", minValue: 0, maxValue: 1, defaultValue: 1 },
      { id: "p2", name: "ParamEyeROpen", minValue: 0, maxValue: 1, defaultValue: 1 },
      { id: "p3", name: "ParamMouthOpenY", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p4", name: "ParamMouthForm", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "p5", name: "ParamAngleX", minValue: -30, maxValue: 30, defaultValue: 0 },
      { id: "p6", name: "ParamAngleY", minValue: -30, maxValue: 30, defaultValue: 0 },
      { id: "p7", name: "ParamAngleZ", minValue: -30, maxValue: 30, defaultValue: 0 },
      { id: "p8", name: "ParamBrowLY", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "p9", name: "ParamBrowRY", minValue: -1, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectMapping(params);
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    expect(mappedCount).toBe(TRACKING_COUNTS.FACE);
  });

  it("6つの手トラッキングパラメータの最大マッピング数がTRACKING_COUNTS.HANDと一致", () => {
    const params: ParameterDefinition[] = [
      { id: "h1", name: "ParamHandLX", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h2", name: "ParamHandLY", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h3", name: "ParamHandLGrip", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "h4", name: "ParamHandRX", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h5", name: "ParamHandRY", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h6", name: "ParamHandRGrip", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    expect(mappedCount).toBe(TRACKING_COUNTS.HAND);
  });

  it("5つのポーズトラッキングパラメータの最大マッピング数がTRACKING_COUNTS.POSEと一致", () => {
    const params: ParameterDefinition[] = [
      { id: "p1", name: "ParamBodyRotZ", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "p2", name: "ParamArmLRaise", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p3", name: "ParamArmRRaise", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p4", name: "ParamArmLBend", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p5", name: "ParamArmRBend", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    expect(mappedCount).toBe(TRACKING_COUNTS.POSE);
  });

  it("i18nのスムージングラベルがja/enどちらでも非空", () => {
    const ja = createT("ja");
    const en = createT("en");
    expect(ja("smoothing").length).toBeGreaterThan(0);
    expect(en("smoothing").length).toBeGreaterThan(0);
  });

  it("VIEWER_DEFAULTS.SMOOTHINGがスライダーの範囲内", () => {
    expect(VIEWER_DEFAULTS.SMOOTHING).toBeGreaterThanOrEqual(
      VIEWER_DEFAULTS.SMOOTHING_MIN,
    );
    expect(VIEWER_DEFAULTS.SMOOTHING).toBeLessThanOrEqual(VIEWER_DEFAULTS.SMOOTHING_MAX);
  });
});

describe("face-mapper → trackingResultToParams → auto-mapper 連携", () => {
  it("mapLandmarksToParamsの出力がtrackingResultToParamsでパラメータ辞書に変換される", () => {
    const landmarks = Array(478)
      .fill(null)
      .map(() => ({ x: 0.5, y: 0.5, z: 0 }));
    const result = mapLandmarksToParams(landmarks);

    const mapping: TrackingParameterMap = {
      eyeOpenLeft: "ParamEyeLOpen",
      mouthOpen: "ParamMouthOpenY",
      headRotationY: "ParamAngleY",
    };

    const params = trackingResultToParams(result, mapping);

    expect("ParamEyeLOpen" in params).toBe(true);
    expect("ParamMouthOpenY" in params).toBe(true);
    expect("ParamAngleY" in params).toBe(true);
    expect(Number.isFinite(params.ParamEyeLOpen)).toBe(true);
    expect(Number.isFinite(params.ParamMouthOpenY)).toBe(true);
  });
});

describe("hand-mapper → handTrackingResultToParams 連携", () => {
  it("mapHandDetectionsToParams → handTrackingResultToParams で一貫した出力", () => {
    const landmarks = Array(21)
      .fill(null)
      .map(() => ({ x: 0.5, y: 0.5, z: 0 }));
    const result = mapHandDetectionsToParams([{ landmarks, handedness: "Left" }]);

    const mapping = { handRX: "ParamHandRX", handRY: "ParamHandRY" };
    const params = handTrackingResultToParams(result, mapping);

    expect("ParamHandRX" in params).toBe(true);
    expect("ParamHandRY" in params).toBe(true);
    expect(Number.isFinite(params.ParamHandRX)).toBe(true);
  });
});

describe("pose-mapper → poseTrackingResultToParams 連携", () => {
  it("mapPoseLandmarksToParams → poseTrackingResultToParams で一貫した出力", () => {
    const landmarks = Array(33)
      .fill(null)
      .map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const result = mapPoseLandmarksToParams(landmarks);

    const mapping = { bodyRotZ: "ParamBodyRotZ", armLRaise: "ParamArmLRaise" };
    const params = poseTrackingResultToParams(result, mapping);

    expect("ParamBodyRotZ" in params).toBe(true);
    expect("ParamArmLRaise" in params).toBe(true);
    expect(Number.isFinite(params.ParamBodyRotZ)).toBe(true);
  });
});

describe("i18n ロケール切替 統合", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("setLocale → detectLocale のラウンドトリップ", () => {
    applyLocalePreference("en", { persist: true });
    expect(detectLocale()).toBe("en");

    applyLocalePreference("ja", { persist: true });
    expect(detectLocale()).toBe("ja");
  });

  it("createTで生成した翻訳関数が全キーで値を返す", () => {
    for (const locale of ["ja", "en"] as const) {
      const t = createT(locale);
      const keys = [
        "openModel",
        "faceTrackingStart",
        "faceTrackingStop",
        "handTrackingStart",
        "handTrackingStop",
        "lipSyncStart",
        "lipSyncStop",
        "poseStart",
        "poseStop",
        "confetti",
        "hearts",
        "stars",
        "sparkles",
        "bgTransparent",
        "bgGreen",
        "bgBlue",
        "errFileLoad",
        "errCameraInit",
        "errHandInit",
        "errMicInit",
        "errPoseInit",
      ] as const;
      for (const key of keys) {
        const val = t(key);
        expect(val.length).toBeGreaterThan(0);
      }
    }
  });
});
