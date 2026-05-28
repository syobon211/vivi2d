import type { ParameterDefinition } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  autoDetectHandMapping,
  autoDetectMapping,
  autoDetectPoseMapping,
  getMappingSummary,
} from "../tracking/auto-mapper";


describe("autoDetectMapping", () => {
  it("matches common 2D rig parameter aliases", () => {
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

    expect(mapping.eyeOpenLeft).toBe("p1");
    expect(mapping.eyeOpenRight).toBe("p2");
    expect(mapping.mouthOpen).toBe("p3");
    expect(mapping.mouthWidth).toBe("p4");
    expect(mapping.headRotationX).toBe("p5");
    expect(mapping.headRotationY).toBe("p6");
    expect(mapping.headRotationZ).toBe("p7");
    expect(mapping.browLeftY).toBe("p8");
    expect(mapping.browRightY).toBe("p9");
  });

  it("日本語パラメータ名にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "左目開閉", minValue: 0, maxValue: 1, defaultValue: 1 },
      { id: "b", name: "右目開閉", minValue: 0, maxValue: 1, defaultValue: 1 },
      { id: "c", name: "口開閉", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "d", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
    ];
    const mapping = autoDetectMapping(params);

    expect(mapping.eyeOpenLeft).toBe("a");
    expect(mapping.eyeOpenRight).toBe("b");
    expect(mapping.mouthOpen).toBe("c");
    expect(mapping.headRotationX).toBe("d");
  });

  it("IDでもマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "ParamAngleX", name: "何か", minValue: -30, maxValue: 30, defaultValue: 0 },
    ];
    const mapping = autoDetectMapping(params);
    expect(mapping.headRotationX).toBe("ParamAngleX");
  });

  it("マッチしないパラメータはundefined", () => {
    const params: ParameterDefinition[] = [
      { id: "x", name: "髪揺れ", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectMapping(params);
    expect(mapping.eyeOpenLeft).toBeUndefined();
    expect(mapping.headRotationX).toBeUndefined();
  });

  it("空のパラメータ配列でクラッシュしない", () => {
    const mapping = autoDetectMapping([]);
    expect(Object.keys(mapping).length).toBe(0);
  });

  it("同じパラメータが複数のキーに割り当てられない", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "左目", minValue: 0, maxValue: 1, defaultValue: 1 },
    ];
    const mapping = autoDetectMapping(params);
    expect(mapping.eyeOpenLeft).toBe("a");
    expect(mapping.browLeftY).toBeUndefined();
  });
});

describe("getMappingSummary", () => {
  it("マッピング結果のサマリーを生成する", () => {
    const params: ParameterDefinition[] = [
      { id: "p1", name: "ParamAngleX", minValue: -30, maxValue: 30, defaultValue: 0 },
    ];
    const mapping = autoDetectMapping(params);
    const summary = getMappingSummary(mapping, params);

    expect(summary.length).toBe(9);

    const angleX = summary.find((s) => s.key === "headRotationX");
    expect(angleX).toBeDefined();
    expect(angleX!.paramName).toBe("ParamAngleX");

    const eyeL = summary.find((s) => s.key === "eyeOpenLeft");
    expect(eyeL!.paramName).toBeNull();
  });
});

describe("autoDetectHandMapping", () => {
  it("手パラメータ標準名にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "h1", name: "ParamHandLX", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h2", name: "ParamHandLY", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h3", name: "ParamHandLGrip", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "h4", name: "ParamHandRX", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h5", name: "ParamHandRY", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "h6", name: "ParamHandRGrip", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);

    expect(mapping.handLX).toBe("h1");
    expect(mapping.handLY).toBe("h2");
    expect(mapping.handLGrip).toBe("h3");
    expect(mapping.handRX).toBe("h4");
    expect(mapping.handRY).toBe("h5");
    expect(mapping.handRGrip).toBe("h6");
  });

  it("日本語パラメータ名にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "左手X", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "b", name: "右手握り", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);

    expect(mapping.handLX).toBe("a");
    expect(mapping.handRGrip).toBe("b");
  });

  it("マッチしないパラメータはundefined", () => {
    const params: ParameterDefinition[] = [
      { id: "x", name: "髪揺れ", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);
    expect(mapping.handLX).toBeUndefined();
    expect(mapping.handRGrip).toBeUndefined();
  });

  it("空のパラメータ配列でクラッシュしない", () => {
    const mapping = autoDetectHandMapping([]);
    expect(Object.keys(mapping).length).toBe(0);
  });

  it("IDでもマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "ParamHandLGrip", name: "何か", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);
    expect(mapping.handLGrip).toBe("ParamHandLGrip");
  });

  it("同じパラメータが複数キーに割り当てられない", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "左手X横", minValue: -1, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectHandMapping(params);
    expect(mapping.handLX).toBe("a");
    expect(mapping.handLY).toBeUndefined();
  });
});

describe("autoDetectPoseMapping", () => {
  it("ポーズパラメータ標準名にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "p1", name: "ParamBodyRotZ", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "p2", name: "ParamArmLRaise", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p3", name: "ParamArmRRaise", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p4", name: "ParamArmLBend", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "p5", name: "ParamArmRBend", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);

    expect(mapping.bodyRotZ).toBe("p1");
    expect(mapping.armLRaise).toBe("p2");
    expect(mapping.armRRaise).toBe("p3");
    expect(mapping.armLBend).toBe("p4");
    expect(mapping.armRBend).toBe("p5");
  });

  it("日本語パラメータ名にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "体傾き", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "b", name: "左腕上げ", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "c", name: "右肘曲げ", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);

    expect(mapping.bodyRotZ).toBe("a");
    expect(mapping.armLRaise).toBe("b");
    expect(mapping.armRBend).toBe("c");
  });

  it("IDでもマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "ParamArmLBend", name: "何か", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);
    expect(mapping.armLBend).toBe("ParamArmLBend");
  });

  it("マッチしないパラメータはundefined", () => {
    const params: ParameterDefinition[] = [
      { id: "x", name: "髪揺れ", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);
    expect(mapping.bodyRotZ).toBeUndefined();
    expect(mapping.armLRaise).toBeUndefined();
  });

  it("空のパラメータ配列でクラッシュしない", () => {
    const mapping = autoDetectPoseMapping([]);
    expect(Object.keys(mapping).length).toBe(0);
  });

  it("英語名のバリエーション（body tilt, left elbow等）にマッチする", () => {
    const params: ParameterDefinition[] = [
      { id: "a", name: "body tilt z", minValue: -1, maxValue: 1, defaultValue: 0 },
      { id: "b", name: "left elbow bend", minValue: 0, maxValue: 1, defaultValue: 0 },
      { id: "c", name: "right arm raise", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const mapping = autoDetectPoseMapping(params);

    expect(mapping.bodyRotZ).toBe("a");
    expect(mapping.armLBend).toBe("b");
    expect(mapping.armRRaise).toBe("c");
  });
});
