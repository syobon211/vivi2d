import { bakePhysics } from "@vivi2d/core/physics-bake";
import type {
  AnimationClip,
  ParameterDefinition,
  PhysicsGroup,
} from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


function makeClip(duration = 60): AnimationClip {
  return {
    id: "clip-1",
    name: "ベイクテストクリップ",
    duration,
    fps: 30,
    tracks: [
      {
        parameterId: "input-param",
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 30, value: 10, interpolation: "linear" },
          { frame: 60, value: 0, interpolation: "linear" },
        ],
      },
    ],
  };
}

function makePhysicsGroup(id: string, name: string): PhysicsGroup {
  return {
    id,
    name,
    enabled: true,
    pendulums: [{ length: 1.0, mass: 1.0, damping: 0.05 }],
    inputs: [{ parameterId: "input-param", weight: 1.0, type: "x" }],
    outputs: [
      { parameterId: "output-param", pendulumIndex: 0, weight: 1.0, type: "angle" },
    ],
    gravityDirection: 0,
    gravityStrength: 9.8,
    wind: 0,
  };
}

function makeParamDefs(): ParameterDefinition[] {
  return [
    { id: "input-param", name: "入力", minValue: -30, maxValue: 30, defaultValue: 0 },
    { id: "output-param", name: "出力", minValue: -30, maxValue: 30, defaultValue: 0 },
  ];
}

// ============================================================
// bakePhysics
// ============================================================

describe("bakePhysics", () => {
  it("正しいフレーム数のキーフレームが生成される", () => {
    const clip = makeClip(60);
    const groups = [makePhysicsGroup("g1", "前髪")];
    const defs = makeParamDefs();

    const result = bakePhysics(clip, groups, defs, {
      startFrame: 0,
      endFrame: 60,
      fps: 30,
      sampleInterval: 1,
    });

    const outputKfs = result.parameterKeyframes["output-param"];
    expect(outputKfs).toBeDefined();
    expect(outputKfs!.length).toBe(61);

    expect(outputKfs![0]!.frame).toBe(0);
    expect(outputKfs![60]!.frame).toBe(60);
  });

  it("sampleInterval=2で半分のキーフレーム数になる", () => {
    const clip = makeClip(60);
    const groups = [makePhysicsGroup("g1", "前髪")];
    const defs = makeParamDefs();

    const result = bakePhysics(clip, groups, defs, {
      startFrame: 0,
      endFrame: 60,
      fps: 30,
      sampleInterval: 2,
    });

    const outputKfs = result.parameterKeyframes["output-param"];
    expect(outputKfs).toBeDefined();
    expect(outputKfs!.length).toBe(31);

    for (const kf of outputKfs!) {
      expect(kf.frame % 2).toBe(0);
    }
  });

  it("groupIds指定で対象グループのみベイクされる", () => {
    const clip = makeClip(30);
    const group1 = makePhysicsGroup("g1", "前髪");
    const group2: PhysicsGroup = {
      ...makePhysicsGroup("g2", "横髪"),
      outputs: [
        { parameterId: "output-param-2", pendulumIndex: 0, weight: 1.0, type: "angle" },
      ],
    };
    const defs: ParameterDefinition[] = [
      ...makeParamDefs(),
      {
        id: "output-param-2",
        name: "出力2",
        minValue: -30,
        maxValue: 30,
        defaultValue: 0,
      },
    ];

    const result = bakePhysics(clip, [group1, group2], defs, {
      startFrame: 0,
      endFrame: 30,
      fps: 30,
      sampleInterval: 1,
      groupIds: ["g1"],
    });

    expect(result.parameterKeyframes["output-param"]).toBeDefined();
    expect(result.parameterKeyframes["output-param-2"]).toBeUndefined();
  });

  it("groupIds が空配列なら全グループがベイクされる", () => {
    const clip = makeClip(10);
    const group1 = makePhysicsGroup("g1", "前髪");
    const group2: PhysicsGroup = {
      ...makePhysicsGroup("g2", "横髪"),
      outputs: [
        { parameterId: "output-param-2", pendulumIndex: 0, weight: 1.0, type: "angle" },
      ],
    };
    const defs: ParameterDefinition[] = [
      ...makeParamDefs(),
      {
        id: "output-param-2",
        name: "出力2",
        minValue: -30,
        maxValue: 30,
        defaultValue: 0,
      },
    ];

    const result = bakePhysics(clip, [group1, group2], defs, {
      startFrame: 0,
      endFrame: 10,
      fps: 30,
      sampleInterval: 1,
    });

    expect(result.parameterKeyframes["output-param"]).toBeDefined();
    expect(result.parameterKeyframes["output-param-2"]).toBeDefined();
  });

  it("対象グループが見つからなければ空の結果を返す", () => {
    const clip = makeClip(10);
    const groups = [makePhysicsGroup("g1", "前髪")];
    const defs = makeParamDefs();

    const result = bakePhysics(clip, groups, defs, {
      startFrame: 0,
      endFrame: 10,
      fps: 30,
      sampleInterval: 1,
      groupIds: ["nonexistent"],
    });

    expect(Object.keys(result.parameterKeyframes)).toHaveLength(0);
    expect(Object.keys(result.boneKeyframes)).toHaveLength(0);
  });

  it("ボーン出力を含むグループのベイクができる", () => {
    const clip = makeClip(10);
    const group: PhysicsGroup = {
      id: "g-bone",
      name: "ボーン揺れ",
      enabled: true,
      pendulums: [{ length: 1.0, mass: 1.0, damping: 0.05 }],
      inputs: [{ parameterId: "input-param", weight: 1.0, type: "x" }],
      outputs: [{ boneId: "bone-1", pendulumIndex: 0, weight: 1.0, type: "boneAngle" }],
      gravityDirection: 0,
      gravityStrength: 9.8,
      wind: 0,
    };
    const defs = makeParamDefs();

    const result = bakePhysics(clip, [group], defs, {
      startFrame: 0,
      endFrame: 10,
      fps: 30,
      sampleInterval: 1,
    });

    expect(result.boneKeyframes["bone-1"]).toBeDefined();
    expect(result.boneKeyframes["bone-1"]!.length).toBe(11);
  });
});
