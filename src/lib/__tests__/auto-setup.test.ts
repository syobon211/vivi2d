
import { describe, expect, it, vi } from "vitest";
import type { GeneratedBone } from "@/lib/ai-bone-generator";
import type { MeshGenerationResult } from "@/lib/auto-setup";
import {
  buildSafeAutoSetupPlan,
  generateAutoMeshes,
  generateAutoWeights,
  previewAutoSetup,
} from "@/lib/auto-setup";
import { createAutoSetupAcceptedManualMasks } from "@/lib/auto-setup-accepted-masks";
import * as autoMeshClient from "@/lib/workers/auto-mesh-client";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";

const VALID_SOURCE_FINGERPRINT =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function alphaMask(
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
): Uint8Array {
  const alpha = new Uint8Array(width * height);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          alpha[y * width + x] = 255;
        }
      }
    }
  }
  return alpha;
}

function acceptedSplitMetadata(id: string) {
  return {
    kind: "maskExtractedLayer" as const,
    ownership: "userAccepted" as const,
    origin: "manualMask" as const,
    manualSplitLayerId: `split-${id}`,
    manualSplitSourceLayerId: "source-png",
    manualSplitSourceFingerprint: VALID_SOURCE_FINGERPRINT,
    manualSplitMaskId: `mask-${id}`,
    maskCoverage: 0.5,
    edgeFeatherPx: 1,
  };
}

describe("previewAutoSetup", () => {
  it("レイヤー名からパーツ検出しボーン生成結果を返す", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "左目", x: 350, y: 200, width: 50, height: 30 }),
        createViviMesh({ name: "右目", x: 450, y: 200, width: 50, height: 30 }),
        createViviMesh({ name: "口", x: 400, y: 350, width: 60, height: 25 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: true,
      generatePhysics: false,
      minConfidence: 0.3,
    });

    expect(result.detectedParts.length).toBeGreaterThan(0);
    expect(result.boneResult).not.toBeNull();
    expect(result.boneResult!.bones.length).toBeGreaterThan(0);
    expect(result.physicsGroups).toHaveLength(0);
  });

  it("creates controller-rig bindings without mesh delta targets", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "head", x: 300, y: 100, width: 200, height: 160 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: true,
      generatePhysics: false,
      minConfidence: 0.3,
    });

    const plan = buildSafeAutoSetupPlan(project, result);
    const bindingOperations = plan.operations.filter(
      (operation) => operation.kind === "createBinding",
    );

    expect(bindingOperations.length).toBeGreaterThan(0);
    expect(bindingOperations).toContainEqual(
      expect.objectContaining({
        kind: "createBinding",
        target: expect.objectContaining({
          type: "bone",
          tempBoneId: "bone_head",
        }),
      }),
    );
    expect(
      bindingOperations.every((operation) => operation.target.type === "bone"),
    ).toBe(true);
  });

  it("keeps split-layer pseudo-mask motion suggestions in review before compiling skins", () => {
    const splitLayer = createViviMesh({
      id: "hair-front",
      name: "Hair Front",
      width: 48,
      height: 140,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: {
        kind: "maskExtractedLayer",
        ownership: "userAccepted",
        origin: "manualMask",
        manualSplitLayerId: "split-hair-front",
        manualSplitSourceLayerId: "source-png",
        manualSplitSourceFingerprint: "sha256:source",
        manualSplitMaskId: "mask-hair-front",
        maskCoverage: 0.5,
        edgeFeatherPx: 1,
      },
    });
    const project = {
      ...createEmptyProject(),
      layers: [splitLayer],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.3,
    });
    const plan = buildSafeAutoSetupPlan(project, result, {
      sourceFingerprint: "sha256:test",
    });

    expect(result.motionHandleDraft?.regions).toHaveLength(1);
    expect(result.motionHandleDraft?.regions[0]?.handleSuggestion).toEqual(
      expect.objectContaining({ status: "review", autoApplicable: false }),
    );
    expect(plan.operations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createSkin",
          layerId: "hair-front",
          solver: "secondaryMotion",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toMatch(/previewOnly|mls|arap/i);
  });

  it("compiles accepted split-layer alpha masks into safe secondary motion operations", () => {
    const head = createViviMesh({
      id: "head",
      name: "Head",
      x: 10,
      y: 0,
      width: 48,
      height: 24,
      semanticRole: "head",
      manualSplitOutputMetadata: acceptedSplitMetadata("head"),
    });
    const hair = createViviMesh({
      id: "hair-front",
      name: "Hair Front",
      x: 10,
      y: 24,
      width: 48,
      height: 64,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: acceptedSplitMetadata("hair-front"),
    });
    const project = {
      ...createEmptyProject(),
      layers: [head, hair],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.3,
      acceptedManualMasks: {
        "hair-front": {
          width: 48,
          height: 64,
          alpha: alphaMask(48, 64, [{ x: 20, y: 16, width: 8, height: 32 }]),
        },
      },
    });
    const plan = buildSafeAutoSetupPlan(project, result, {
      sourceFingerprint: "sha256:test",
    });

    expect(result.motionHandleDraft?.regions).toHaveLength(2);
    expect(
      result.motionHandleDraft?.regions.find((region) => region.layerId === "hair-front")
        ?.handleSuggestion,
    ).toEqual(expect.objectContaining({ status: "apply", autoApplicable: true }));
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createSkin",
          layerId: "hair-front",
          solver: "secondaryMotion",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toMatch(/previewOnly|mls|arap/i);
  });

  it("extracts accepted split-layer alpha masks from texture canvases", () => {
    const hair = createViviMesh({
      id: "hair-front",
      name: "Hair Front",
      width: 4,
      height: 3,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: acceptedSplitMetadata("hair-front"),
    });
    const data = new Uint8ClampedArray(4 * 3 * 4);
    data[3] = 255;
    data[7] = 128;
    const canvas = {
      width: 4,
      height: 3,
      getContext: () => ({
        getImageData: () => ({ data }),
      }),
    } as unknown as HTMLCanvasElement;

    const masks = createAutoSetupAcceptedManualMasks(
      { ...createEmptyProject(), layers: [hair] },
      (layerId) => (layerId === "hair-front" || layerId === "source-png" ? canvas : undefined),
    );

    expect(masks["hair-front"]?.alpha[0]).toBe(255);
    expect(masks["mask-hair-front"]?.alpha[1]).toBe(128);
    expect(masks["hair-front"]?.fingerprint).toMatch(
      /^maskAlpha:v1:[a-f0-9]{16}$/,
    );
    expect(masks["hair-front"]?.acceptedMaskAlphaHash).toMatch(
      /^sha256:v1:maskAlphaCanonical.v2:[a-f0-9]{64}$/,
    );
    expect(masks["hair-front"]?.acceptedMaskPlacementHash).toMatch(
      /^sha256:v1:maskPlacementCanonical.v2:[a-f0-9]{64}$/,
    );
    expect(masks["hair-front"]?.sourceMaskBytesHash).toMatch(
      /^sha256:v1:maskSourceCanonical:[a-f0-9]{64}$/,
    );
  });

  it("rejects accepted mask registry conflicts instead of last-write wins", () => {
    const first = createViviMesh({
      id: "hair-a",
      name: "Hair A",
      width: 2,
      height: 2,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: acceptedSplitMetadata("hair-front"),
    });
    const second = createViviMesh({
      id: "hair-b",
      name: "Hair B",
      width: 2,
      height: 2,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: {
        ...acceptedSplitMetadata("hair-b"),
        manualSplitMaskId: "mask-hair-front",
      },
    });
    const data = new Uint8ClampedArray(2 * 2 * 4);
    data[3] = 255;
    const canvas = {
      width: 2,
      height: 2,
      getContext: () => ({
        getImageData: () => ({ data }),
      }),
    } as unknown as HTMLCanvasElement;

    const masks = createAutoSetupAcceptedManualMasks(
      { ...createEmptyProject(), layers: [first, second] },
      () => canvas,
    );

    expect(masks["hair-a"]).toBeUndefined();
    expect(masks["hair-b"]).toBeUndefined();
    expect(masks["mask-hair-front"]).toBeUndefined();
  });

  it("feeds registry-created accepted masks through Auto Setup suggestions", () => {
    const head = createViviMesh({
      id: "head",
      name: "Head",
      x: 10,
      y: 0,
      width: 48,
      height: 24,
      semanticRole: "head",
      manualSplitOutputMetadata: acceptedSplitMetadata("head"),
    });
    const hair = createViviMesh({
      id: "hair-front",
      name: "Hair Front",
      x: 10,
      y: 24,
      width: 48,
      height: 64,
      semanticRole: "hairFront",
      manualSplitOutputMetadata: acceptedSplitMetadata("hair-front"),
    });
    const project = { ...createEmptyProject(), layers: [head, hair] };
    const canvasFor = (width: number, height: number, alpha: Uint8Array) =>
      ({
        width,
        height,
        getContext: () => ({
          getImageData: () => {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let index = 0; index < alpha.length; index += 1) {
              data[index * 4 + 3] = alpha[index] ?? 0;
            }
            return { data };
          },
        }),
      }) as unknown as HTMLCanvasElement;
    const masks = createAutoSetupAcceptedManualMasks(project, (layerId) => {
      if (layerId === "head") {
        return canvasFor(24, 12, alphaMask(24, 12, [{ x: 4, y: 2, width: 16, height: 8 }]));
      }
      if (layerId === "hair-front") {
        return canvasFor(24, 32, alphaMask(24, 32, [{ x: 10, y: 8, width: 4, height: 16 }]));
      }
      if (layerId === "source-png") {
        return canvasFor(96, 96, alphaMask(96, 96, [{ x: 0, y: 0, width: 96, height: 96 }]));
      }
      return undefined;
    });
    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.3,
      acceptedManualMasks: masks,
    });

    const hairRegion = result.motionHandleDraft?.regions.find(
      (region) => region.layerId === "hair-front",
    );
    expect(hairRegion?.handleSuggestion).toEqual(
      expect.objectContaining({ status: "apply", autoApplicable: true }),
    );
  });

  it("揺れパーツがある場合に物理グループが生成される", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "前髪", x: 300, y: 50, width: 200, height: 120 }),
        createViviMesh({ name: "しっぽ", x: 600, y: 400, width: 50, height: 150 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: true,
      minConfidence: 0.3,
    });

    expect(result.boneResult).toBeNull();
    expect(result.physicsGroups.length).toBeGreaterThan(0);
  });

  it("確信度フィルタが機能する", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "左目", x: 350, y: 200, width: 50, height: 30 }),
        createViviMesh({ name: "パーツX", x: 0, y: 0, width: 100, height: 100 }),
      ],
    };

    const lowThreshold = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.1,
    });
    const highThreshold = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.9,
    });

    expect(lowThreshold.detectedParts.length).toBeGreaterThanOrEqual(
      highThreshold.detectedParts.length,
    );
  });

  it("空プロジェクトでは検出結果が空", () => {
    const project = createEmptyProject();
    const result = previewAutoSetup(project, {
      generateBones: true,
      generatePhysics: true,
      minConfidence: 0.3,
    });

    expect(result.detectedParts).toHaveLength(0);
    expect(result.boneResult).not.toBeNull();
    expect(result.boneResult!.bones.length).toBeGreaterThanOrEqual(0);
    expect(result.physicsGroups).toHaveLength(0);
  });


  it("物理のみ生成（generateBones=false, generatePhysics=true）で boneResult が null", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "前髪", x: 300, y: 50, width: 200, height: 120 }),
        createViviMesh({ name: "左目", x: 350, y: 200, width: 50, height: 30 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: true,
      minConfidence: 0.3,
    });

    expect(result.boneResult).toBeNull();
    expect(result.physicsGroups.length).toBeGreaterThanOrEqual(0);
    expect(result.detectedParts.length).toBeGreaterThan(0);
  });

  it("両方無効（generateBones=false, generatePhysics=false）で bone=null, physics=[]", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "左目", x: 350, y: 200, width: 50, height: 30 }),
        createViviMesh({ name: "口", x: 400, y: 350, width: 60, height: 25 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.3,
    });

    expect(result.boneResult).toBeNull();
    expect(result.physicsGroups).toHaveLength(0);
    expect(result.detectedParts.length).toBeGreaterThan(0);
  });

  it("高い minConfidence で低確信度パーツがフィルタされる", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createViviMesh({ name: "口", x: 400, y: 350, width: 60, height: 25 }),
        createViviMesh({ name: "何か", x: 0, y: 0, width: 100, height: 100 }),
      ],
    };

    const highResult = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.9,
    });

    expect(highResult.detectedParts).toHaveLength(0);
    expect(highResult.physicsGroups).toHaveLength(0);
  });

  it("位置ベース検出: unknown パーツが位置で推定される（上部→head, 中部→body）", () => {
    const project = {
      ...createEmptyProject(),
      width: 800,
      height: 600,
      layers: [
        createViviMesh({ name: "パーツ上", x: 300, y: 50, width: 100, height: 50 }),
        createViviMesh({ name: "パーツ中", x: 300, y: 250, width: 100, height: 50 }),
        createViviMesh({ name: "パーツ下", x: 300, y: 500, width: 100, height: 50 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0,
    });

    const upperPart = result.detectedParts.find((p) => p.layerName === "パーツ上");
    expect(upperPart).toBeDefined();
    expect(upperPart!.category).toBe("head");
    expect(upperPart!.confidence).toBeCloseTo(0.2);

    const midPart = result.detectedParts.find((p) => p.layerName === "パーツ中");
    expect(midPart).toBeDefined();
    expect(midPart!.category).toBe("body");
    expect(midPart!.confidence).toBeCloseTo(0.15);

    const lowerPart = result.detectedParts.find((p) => p.layerName === "パーツ下");
    expect(lowerPart).toBeDefined();
    expect(lowerPart!.category).toBe("unknown");
  });

  it("位置推定パーツは minConfidence でフィルタされうる（フィルタが先に実行される）", () => {
    const project = {
      ...createEmptyProject(),
      width: 800,
      height: 600,
      layers: [
        createViviMesh({ name: "不明パーツ", x: 300, y: 50, width: 100, height: 50 }),
      ],
    };

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.1,
    });

    // Positional refinement runs before confidence filtering, so the
    // upper-canvas unknown layer can pass a relaxed threshold as "head".
    expect(result.detectedParts).toHaveLength(1);
    expect(result.detectedParts[0]!.category).toBe("head");
    expect(result.detectedParts[0]!.confidence).toBeCloseTo(0.2);
  });
});


describe("generateAutoWeights", () => {
  function createTestMeshResult(layerId = "mesh-1"): MeshGenerationResult {
    const vertices: number[] = [];
    const indices: number[] = [];
    const size = 100;
    const cols = 5;
    const rows = 5;
    const dx = size / (cols - 1);
    const dy = size / (rows - 1);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        vertices.push(c * dx, r * dy);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = r * cols + c;
        indices.push(tl, tl + 1, tl + cols + 1);
        indices.push(tl, tl + cols + 1, tl + cols);
      }
    }

    return {
      layerId,
      layerName: "テストメッシュ",
      mesh: {
        vertices,
        uvs: vertices.map((v) => v / size),
        indices,
        divisionsX: 0,
        divisionsY: 0,
      },
    };
  }

  function createTestBones(): GeneratedBone[] {
    return [
      {
        tempId: "bone_head",
        name: "頭",
        parentTempId: null,
        x: 50,
        y: 10,
        partCategory: "head",
      },
      {
        tempId: "bone_body",
        name: "体",
        parentTempId: null,
        x: 50,
        y: 60,
        partCategory: "body",
      },
    ];
  }

  it("ボーンが空の場合は空配列を返す", async () => {
    const meshResults = [createTestMeshResult()];
    const result = await generateAutoWeights(meshResults, []);
    expect(result).toEqual([]);
  });

  it("メッシュが空の場合は空配列を返す", async () => {
    const result = await generateAutoWeights([], createTestBones());
    expect(result).toEqual([]);
  });

  it("有効なメッシュとボーンでウェイトが生成される", async () => {
    const meshResults = [createTestMeshResult()];
    const bones = createTestBones();
    const result = await generateAutoWeights(meshResults, bones);

    expect(result).toHaveLength(1);
    expect(result[0]!.layerId).toBe("mesh-1");
    expect(result[0]!.boneIds).toEqual(["bone_head", "bone_body"]);
    expect(result[0]!.weights).toHaveLength(25);

    for (const vw of result[0]!.weights) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("複数メッシュで各メッシュにウェイトが生成される", async () => {
    const meshResults = [createTestMeshResult("mesh-1"), createTestMeshResult("mesh-2")];
    const bones = createTestBones();
    const result = await generateAutoWeights(meshResults, bones);

    expect(result).toHaveLength(2);
    expect(result[0]!.layerId).toBe("mesh-1");
    expect(result[1]!.layerId).toBe("mesh-2");
  });

  it("インデックスが3未満のメッシュはスキップされる", async () => {
    const emptyMesh: MeshGenerationResult = {
      layerId: "empty",
      layerName: "空メッシュ",
      mesh: {
        vertices: [0, 0, 1, 0],
        uvs: [0, 0, 1, 0],
        indices: [],
        divisionsX: 0,
        divisionsY: 0,
      },
    };
    const result = await generateAutoWeights([emptyMesh], createTestBones());
    expect(result).toEqual([]);
  });

  it("親子階層を持つボーンでウェイトが生成される", async () => {
    const meshResults = [createTestMeshResult()];
    const hierarchicalBones: GeneratedBone[] = [
      {
        tempId: "bone_body",
        name: "体",
        parentTempId: null,
        x: 50,
        y: 80,
        partCategory: "body",
      },
      {
        tempId: "bone_head",
        name: "頭",
        parentTempId: "bone_body",
        x: 50,
        y: 20,
        partCategory: "head",
      },
      {
        tempId: "bone_eye",
        name: "左目",
        parentTempId: "bone_head",
        x: 40,
        y: 10,
        partCategory: "eyeLeft",
      },
    ];
    const result = await generateAutoWeights(meshResults, hierarchicalBones);

    expect(result).toHaveLength(1);
    expect(result[0]!.boneIds).toEqual(["bone_body", "bone_head", "bone_eye"]);
    expect(result[0]!.weights).toHaveLength(25);

    for (const vw of result[0]!.weights) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("3段階層ボーンで全ボーンIDがboneIdsに含まれる", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "root",
        name: "ルート",
        parentTempId: null,
        x: 50,
        y: 90,
        partCategory: "body",
      },
      {
        tempId: "mid",
        name: "中間",
        parentTempId: "root",
        x: 50,
        y: 50,
        partCategory: "head",
      },
      {
        tempId: "leaf",
        name: "リーフ",
        parentTempId: "mid",
        x: 50,
        y: 10,
        partCategory: "eyeLeft",
      },
    ];
    const result = await generateAutoWeights(meshResults, bones);

    expect(result[0]!.boneIds).toHaveLength(3);
    expect(result[0]!.boneIds).toContain("root");
    expect(result[0]!.boneIds).toContain("mid");
    expect(result[0]!.boneIds).toContain("leaf");
  });

  it("親子階層ボーンの各頂点ウェイトが全てのボーンを参照する", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "bone_a",
        name: "A",
        parentTempId: null,
        x: 0,
        y: 50,
        partCategory: "body",
      },
      {
        tempId: "bone_b",
        name: "B",
        parentTempId: "bone_a",
        x: 100,
        y: 50,
        partCategory: "head",
      },
    ];
    const result = await generateAutoWeights(meshResults, bones);

    for (const vw of result[0]!.weights) {
      const boneIdsInWeight = vw.map((w) => w.boneId);
      expect(boneIdsInWeight.length).toBeGreaterThan(0);
      for (const id of boneIdsInWeight) {
        expect(["bone_a", "bone_b"]).toContain(id);
      }
    }
  });

  it("ボーンが1つだけの場合、全頂点がそのボーンにウェイト1.0を持つ", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "only",
        name: "唯一",
        parentTempId: null,
        x: 50,
        y: 50,
        partCategory: "body",
      },
    ];
    const result = await generateAutoWeights(meshResults, bones);

    expect(result).toHaveLength(1);
    for (const vw of result[0]!.weights) {
      expect(vw).toHaveLength(1);
      expect(vw[0]!.boneId).toBe("only");
      expect(vw[0]!.weight).toBeCloseTo(1.0, 2);
    }
  });

  it("スター型階層（1親+多数の子）でウェイトが正常に計算される", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "center",
        name: "中心",
        parentTempId: null,
        x: 50,
        y: 50,
        partCategory: "body",
      },
      {
        tempId: "top",
        name: "上",
        parentTempId: "center",
        x: 50,
        y: 0,
        partCategory: "head",
      },
      {
        tempId: "bottom",
        name: "下",
        parentTempId: "center",
        x: 50,
        y: 100,
        partCategory: "armLeft",
      },
      {
        tempId: "left",
        name: "左",
        parentTempId: "center",
        x: 0,
        y: 50,
        partCategory: "armRight",
      },
      {
        tempId: "right",
        name: "右",
        parentTempId: "center",
        x: 100,
        y: 50,
        partCategory: "eyeLeft",
      },
    ];
    const result = await generateAutoWeights(meshResults, bones);

    expect(result).toHaveLength(1);
    expect(result[0]!.boneIds).toHaveLength(5);

    for (const vw of result[0]!.weights) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it("異なるオプションでもウェイト合計が1.0を維持する", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      { tempId: "a", name: "A", parentTempId: null, x: 20, y: 50, partCategory: "body" },
      { tempId: "b", name: "B", parentTempId: "a", x: 80, y: 50, partCategory: "head" },
    ];
    const result = await generateAutoWeights(meshResults, bones, { maxIterations: 5 });

    for (const vw of result[0]!.weights) {
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 1);
    }
  });

  it("ウェイト値が全て0以上1以下である", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "body",
        name: "体",
        parentTempId: null,
        x: 50,
        y: 80,
        partCategory: "body",
      },
      {
        tempId: "head",
        name: "頭",
        parentTempId: "body",
        x: 50,
        y: 20,
        partCategory: "head",
      },
    ];
    const result = await generateAutoWeights(meshResults, bones);

    for (const vw of result[0]!.weights) {
      for (const w of vw) {
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses rigid layer bindings instead of BBW for protected layers", async () => {
    const meshResults = [createTestMeshResult()];
    const bones = createTestBones();
    const result = await generateAutoWeights(meshResults, bones, undefined, {
      rigidLayerBoneIds: { "mesh-1": "bone_head" },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.layerId).toBe("mesh-1");
    expect(result[0]!.boneIds).toEqual(["bone_head"]);
    expect(result[0]!.weights).toHaveLength(25);
    for (const vertexWeights of result[0]!.weights) {
      expect(vertexWeights).toEqual([{ boneId: "bone_head", weight: 1 }]);
    }
  });

  it("uses tapered secondary motion weights for root/mid/tip chains", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "hair_root",
        name: "Hair root",
        parentTempId: null,
        x: 50,
        y: 0,
        partCategory: "hairFront",
      },
      {
        tempId: "hair_mid",
        name: "Hair mid",
        parentTempId: null,
        x: 50,
        y: 50,
        partCategory: "hairFront",
      },
      {
        tempId: "hair_tip",
        name: "Hair tip",
        parentTempId: null,
        x: 50,
        y: 100,
        partCategory: "hairFront",
      },
    ];

    const result = await generateAutoWeights(meshResults, bones, undefined, {
      secondaryMotionBindings: {
        "mesh-1": {
          boneIds: ["hair_root", "hair_mid", "hair_tip"],
          axis: "vertical",
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.boneIds).toEqual(["hair_root", "hair_mid", "hair_tip"]);
    const topVertexWeights = result[0]!.weights[0]!;
    const bottomVertexWeights = result[0]!.weights.at(-1)!;
    expect(topVertexWeights[0]!.boneId).toBe("hair_root");
    expect(topVertexWeights[0]!.weight).toBeGreaterThan(0.95);
    const bottomTipWeight =
      bottomVertexWeights.find((weight) => weight.boneId === "hair_tip")?.weight ?? 0;
    const bottomMidWeight =
      bottomVertexWeights.find((weight) => weight.boneId === "hair_mid")?.weight ?? 0;
    expect(bottomTipWeight).toBeGreaterThan(0.94);
    expect(bottomTipWeight).toBeLessThan(0.98);
    expect(bottomMidWeight).toBeGreaterThan(0.02);
  });

  it("adds root stabilization when secondary motion risk clamps motion scale", async () => {
    const meshResults = [createTestMeshResult()];
    const bones: GeneratedBone[] = [
      {
        tempId: "hair_root",
        name: "Hair root",
        parentTempId: null,
        x: 50,
        y: 0,
        partCategory: "hairFront",
      },
      {
        tempId: "hair_mid",
        name: "Hair mid",
        parentTempId: null,
        x: 50,
        y: 50,
        partCategory: "hairFront",
      },
      {
        tempId: "hair_tip",
        name: "Hair tip",
        parentTempId: null,
        x: 50,
        y: 100,
        partCategory: "hairFront",
      },
    ];

    const result = await generateAutoWeights(meshResults, bones, undefined, {
      secondaryMotionBindings: {
        "mesh-1": {
          boneIds: ["hair_root", "hair_mid", "hair_tip"],
          axis: "vertical",
          motionScale: 0.6,
          riskScore: 0.9,
        },
      },
    });

    const bottomVertexWeights = result[0]!.weights.at(-1)!;
    const bottomTipWeight =
      bottomVertexWeights.find((weight) => weight.boneId === "hair_tip")?.weight ?? 0;
    const bottomRootWeight =
      bottomVertexWeights.find((weight) => weight.boneId === "hair_root")?.weight ?? 0;
    expect(bottomTipWeight).toBeLessThan(0.75);
    expect(bottomRootWeight).toBeGreaterThan(0.25);
  });
});


describe("generateAutoMeshes", () => {
  it("テクスチャがない場合はスキップされる", async () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "m1", name: "テスト" })],
    };
    const result = await generateAutoMeshes(project, () => undefined, "standard");
    expect(result).toEqual([]);
  });

  it("ViviMesh以外のレイヤーはスキップされる", async () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        {
          id: "g1",
          name: "グループ",
          kind: "group" as const,
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          children: [],
          blendMode: "normal" as const,
          expanded: true,
        },
      ],
    };
    const result = await generateAutoMeshes(project, () => undefined, "standard");
    expect(result).toEqual([]);
  });

  it("カスタムメッシュ（divisionsX=0かつ頂点>8）はスキップされる", async () => {
    const mesh = createViviMesh({ id: "m1", name: "カスタム" });
    mesh.mesh.divisionsX = 0;
    mesh.mesh.vertices = new Array(20).fill(0);
    const project = {
      ...createEmptyProject(),
      layers: [mesh],
    };
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const result = await generateAutoMeshes(project, () => canvas, "standard");
    expect(result).toEqual([]);
  });

  it("グリッドメッシュ（divisionsX>0）はメッシュ生成対象になる", async () => {
    const mesh = createViviMesh({ id: "m1", name: "グリッド", width: 64, height: 64 });
    expect(mesh.mesh.divisionsX).toBeGreaterThan(0);

    const project = {
      ...createEmptyProject(),
      layers: [mesh],
    };

    const mockMesh = {
      vertices: [0, 0, 64, 0, 0, 64, 64, 64],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 3, 0, 3, 2],
      divisionsX: 0,
      divisionsY: 0,
    };
    const spy = vi
      .spyOn(autoMeshClient, "generateAutoMeshAsync")
      .mockResolvedValue(mockMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const result = await generateAutoMeshes(project, () => canvas, "standard");

    expect(result).toHaveLength(1);
    expect(result[0]!.layerId).toBe("m1");
    expect(result[0]!.mesh).toBe(mockMesh);

    spy.mockRestore();
  });

  it("generateAutoMesh が null を返した場合は結果に含まれない", async () => {
    const mesh = createViviMesh({ id: "m1", name: "空", width: 64, height: 64 });
    const project = { ...createEmptyProject(), layers: [mesh] };

    const spy = vi.spyOn(autoMeshClient, "generateAutoMeshAsync").mockResolvedValue(null);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const result = await generateAutoMeshes(project, () => canvas, "fine");
    expect(result).toEqual([]);

    spy.mockRestore();
  });
});
