import { validateModel } from "@vivi2d/core/model-validation";
import type { ViviMeshNode, BoneNode, ProjectData, SkinData } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    name: "test",
    width: 100,
    height: 100,
    layers: [],
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2,
    },
    skins: {},
    colliders: [],
    stateMachines: [],
    ...overrides,
  };
}

function makeBone(id: string, name: string): BoneNode {
  return {
    id,
    name,
    kind: "bone",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
  };
}

function makeViviMesh(id: string, name: string, vertCount = 4): ViviMeshNode {
  const vertices = Array.from({ length: vertCount * 2 }, (_, i) => i * 10);
  const indices = vertCount >= 3 ? [0, 1, 2] : [];
  return {
    id,
    name,
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    children: [],
    blendMode: "normal",
    expanded: true,
    mesh: {
      vertices,
      uvs: vertices.map((v) => v / 100),
      indices,
      divisionsX: 3,
      divisionsY: 3,
    },
  };
}

describe("validateModel", () => {
  it("空プロジェクトは問題なし", () => {
    const issues = validateModel(makeProject());
    expect(issues).toHaveLength(0);
  });

  it("unusedBoneを検出する", () => {
    const bone = makeBone("b1", "unusedBone");
    const project = makeProject({ layers: [bone] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "unusedBone")).toBe(true);
    expect(issues.find((i) => i.category === "unusedBone")?.layerId).toBe("b1");
  });

  it("スキンにバインドされたボーンは未使用と報告しない", () => {
    const bone = makeBone("b1", "バインド済み");
    const mesh = makeViviMesh("m1", "メッシュ");
    const skin: SkinData = {
      weights: [[{ boneId: "b1", weight: 1.0 }]],
      bindPoseInverse: { b1: [1, 0, 0, 1, 0, 0] },
    };
    const project = makeProject({
      layers: [bone, mesh],
      skins: { m1: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "unusedBone")).toBe(false);
  });

  it("パラメータバインディングで使用中のボーンは未使用と報告しない", () => {
    const bone = makeBone("b1", "バインディング対象");
    const project = makeProject({
      layers: [bone],
      parameterBindings: [
        {
          id: "pb1",
          parameterId: "p1",
          target: { type: "bone", boneId: "b1", property: "angle" },
          bindingPoints: [],
        },
      ],
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "unusedBone")).toBe(false);
  });

  it("ウェイト合計が1.0でない頂点を検出する", () => {
    const mesh = makeViviMesh("m1", "メッシュ");
    const skin: SkinData = {
      weights: [
        [{ boneId: "b1", weight: 0.5 }],
      ],
      bindPoseInverse: { b1: [1, 0, 0, 1, 0, 0] },
    };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "weightNormalization")).toBe(true);
  });

  it("ウェイトが正規化されていれば報告しない", () => {
    const mesh = makeViviMesh("m1", "メッシュ");
    const skin: SkinData = {
      weights: [
        [
          { boneId: "b1", weight: 0.6 },
          { boneId: "b2", weight: 0.4 },
        ],
      ],
      bindPoseInverse: { b1: [1, 0, 0, 1, 0, 0], b2: [1, 0, 0, 1, 0, 0] },
    };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "weightNormalization")).toBe(false);
  });

  it("一部の頂点のみウェイト未設定を検出する", () => {
    const mesh = makeViviMesh("m1", "メッシュ", 3);
    const skin: SkinData = {
      weights: [
        [{ boneId: "b1", weight: 1.0 }],
        [],
        [{ boneId: "b1", weight: 1.0 }],
      ],
      bindPoseInverse: { b1: [1, 0, 0, 1, 0, 0] },
    };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "unboundVertices")).toBe(true);
    expect(issues.find((i) => i.category === "unboundVertices")?.message).toContain("1/3");
  });

  it("emptyMeshを検出する", () => {
    const mesh = makeViviMesh("m1", "emptyMesh");
    mesh.mesh.vertices = [];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "emptyMesh")).toBe(true);
  });

  it("orphanSkinを検出する", () => {
    const skin: SkinData = {
      weights: [],
      bindPoseInverse: {},
    };
    const project = makeProject({
      skins: { nonexistent: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "orphanSkin")).toBe(true);
  });

  // --- validateMeshIndexBounds ---

  it("インデックスが頂点範囲内なら報告しない", () => {
    const mesh = makeViviMesh("m1", "正常メッシュ", 4);
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "meshIndexBounds")).toBe(false);
  });

  it("負のインデックスを検出する", () => {
    const mesh = makeViviMesh("m1", "負インデックス", 4);
    mesh.mesh.indices = [-1, 0, 1];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "meshIndexBounds")).toBe(true);
    expect(issues.find((i) => i.category === "meshIndexBounds")!.message).toContain(
      "-1",
    );
  });

  it("頂点数以上のインデックスを検出する", () => {
    const mesh = makeViviMesh("m1", "超過インデックス", 3);
    mesh.mesh.indices = [0, 1, 3];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "meshIndexBounds")).toBe(true);
    expect(issues.find((i) => i.category === "meshIndexBounds")!.message).toContain(
      "out-of-range index 3",
    );
  });

  it("頂点数0のメッシュはインデックス検証をスキップする", () => {
    const mesh = makeViviMesh("m1", "空", 0);
    mesh.mesh.vertices = [];
    mesh.mesh.indices = [0];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "emptyMesh")).toBe(true);
    expect(issues.some((i) => i.category === "meshIndexBounds")).toBe(false);
  });

  it("複数の範囲外インデックスがあっても1メッシュにつき1回だけ報告する", () => {
    const mesh = makeViviMesh("m1", "複数超過", 3);
    mesh.mesh.indices = [5, 10, 20];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    const indexIssues = issues.filter((i) => i.category === "meshIndexBounds");
    expect(indexIssues).toHaveLength(1);
  });


  it("頂点ありでインデックスが空のメッシュをemptyMeshとして検出する", () => {
    const mesh = makeViviMesh("m1", "インデックスなし", 4);
    mesh.mesh.indices = [];
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "emptyMesh")).toBe(true);
    expect(issues.find((i) => i.category === "emptyMesh")!.message).toContain(
      "インデックス",
    );
  });


  it("全頂点がウェイト未設定の場合は未バインドとして報告しない", () => {
    const mesh = makeViviMesh("m1", "全未バインド", 3);
    const skin: SkinData = {
      weights: [[], [], []],
      bindPoseInverse: {},
    };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: skin },
    });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "unboundVertices")).toBe(false);
  });


  it("スキンなしのメッシュはウェイト検証をスキップする", () => {
    const mesh = makeViviMesh("m1", "スキンなし", 4);
    const project = makeProject({ layers: [mesh] });

    const issues = validateModel(project);
    expect(issues.some((i) => i.category === "weightNormalization")).toBe(false);
    expect(issues.some((i) => i.category === "unboundVertices")).toBe(false);
  });


  it("null を含む weights 配列でもクラッシュしない", () => {
    const mesh = makeViviMesh("m1", "メッシュ", 3);
    const skin: SkinData = {
      weights: [
        [{ boneId: "b1", weight: 1.0 }],
        null as unknown as Array<{ boneId: string; weight: number }>,
        [{ boneId: "b1", weight: 1.0 }],
      ],
      bindPoseInverse: { b1: [1, 0, 0, 1, 0, 0] },
    };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: skin },
    });

    expect(() => validateModel(project)).not.toThrow();
  });


  it("orphanSkinと有効スキンが共存する場合、孤立分だけ報告する", () => {
    const mesh = makeViviMesh("m1", "メッシュ");
    const validSkin: SkinData = { weights: [], bindPoseInverse: {} };
    const orphanSkin: SkinData = { weights: [], bindPoseInverse: {} };
    const project = makeProject({
      layers: [mesh],
      skins: { m1: validSkin, ghost: orphanSkin },
    });

    const issues = validateModel(project);
    const orphanIssues = issues.filter((i) => i.category === "orphanSkin");
    expect(orphanIssues).toHaveLength(1);
    expect(orphanIssues[0]!.layerId).toBe("ghost");
  });


  it("unusedBoneは warning、emptyMeshは error、orphanSkinは info", () => {
    const bone = makeBone("b1", "未使用");
    const mesh = makeViviMesh("m1", "空");
    mesh.mesh.vertices = [];
    const orphanSkin: SkinData = { weights: [], bindPoseInverse: {} };
    const project = makeProject({
      layers: [bone, mesh],
      skins: { orphan: orphanSkin },
    });

    const issues = validateModel(project);
    expect(issues.find((i) => i.category === "unusedBone")!.severity).toBe("warning");
    expect(issues.find((i) => i.category === "emptyMesh")!.severity).toBe("error");
    expect(issues.find((i) => i.category === "orphanSkin")!.severity).toBe("info");
  });
});
