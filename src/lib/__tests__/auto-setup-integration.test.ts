import type { LayerNode } from "@vivi2d/core/types";
import { describe, expect, it, vi } from "vitest";
import {
  generateAllBones,
  generateBodyBones,
  generateFaceBones,
} from "@/lib/ai-bone-generator";
import type { DetectedPart } from "@/lib/ai-part-detector";
import {
  detectParts,
  filterDetectedParts,
  refineByPosition,
} from "@/lib/ai-part-detector";
import { detectSwayingParts, generatePhysicsGroups } from "@/lib/ai-physics-generator";
import { generateAutoWeights } from "@/lib/auto-setup";
import * as bbwClient from "@/lib/workers/bbw-weights-client";
import { createGroup, createViviMesh } from "@/test/fixtures";

function createVTuberLayerTree(): {
  layers: LayerNode[];
  canvasWidth: number;
  canvasHeight: number;
} {
  const canvasWidth = 1920;
  const canvasHeight = 1080;

  const eyeLeft = createViviMesh({
    name: "左目",
    x: canvasWidth * 0.4,
    y: canvasHeight * 0.2,
    width: 80,
    height: 40,
  });
  const eyeRight = createViviMesh({
    name: "右目",
    x: canvasWidth * 0.6,
    y: canvasHeight * 0.2,
    width: 80,
    height: 40,
  });
  const eyebrowLeft = createViviMesh({
    name: "左眉",
    x: canvasWidth * 0.38,
    y: canvasHeight * 0.15,
    width: 100,
    height: 20,
  });
  const eyebrowRight = createViviMesh({
    name: "右眉",
    x: canvasWidth * 0.58,
    y: canvasHeight * 0.15,
    width: 100,
    height: 20,
  });
  const mouth = createViviMesh({
    name: "口",
    x: canvasWidth * 0.48,
    y: canvasHeight * 0.3,
    width: 60,
    height: 30,
  });
  const face = createGroup({
    name: "顔",
    children: [eyeLeft, eyeRight, eyebrowLeft, eyebrowRight, mouth],
    x: canvasWidth * 0.35,
    y: canvasHeight * 0.1,
    width: 300,
    height: 250,
  });

  const hairFront = createViviMesh({
    name: "前髪",
    x: canvasWidth * 0.35,
    y: canvasHeight * 0.05,
    width: 300,
    height: 150,
  });
  const hairBack = createViviMesh({
    name: "後ろ髪",
    x: canvasWidth * 0.3,
    y: canvasHeight * 0.05,
    width: 350,
    height: 400,
  });
  const hairSide = createViviMesh({
    name: "横髪",
    x: canvasWidth * 0.25,
    y: canvasHeight * 0.15,
    width: 100,
    height: 200,
  });

  const body = createViviMesh({
    name: "体",
    x: canvasWidth * 0.35,
    y: canvasHeight * 0.4,
    width: 300,
    height: 400,
  });
  const armLeft = createViviMesh({
    name: "左腕",
    x: canvasWidth * 0.2,
    y: canvasHeight * 0.45,
    width: 150,
    height: 250,
  });
  const armRight = createViviMesh({
    name: "右腕",
    x: canvasWidth * 0.7,
    y: canvasHeight * 0.45,
    width: 150,
    height: 250,
  });

  const ribbon = createViviMesh({
    name: "リボン",
    x: canvasWidth * 0.5,
    y: canvasHeight * 0.08,
    width: 60,
    height: 40,
  });

  const layers: LayerNode[] = [
    face,
    hairFront,
    hairBack,
    hairSide,
    body,
    armLeft,
    armRight,
    ribbon,
  ];

  return { layers, canvasWidth, canvasHeight };
}

describe("自動生成統合テスト", () => {
  describe("検出→フィルタリング→ボーン生成→物理生成の完全パイプライン", () => {
    it("典型的なVTuberモデルで全パイプラインが正常に動作する", () => {
      const { layers, canvasWidth, canvasHeight } = createVTuberLayerTree();
      const allParts = detectParts(layers);
      expect(allParts.length).toBeGreaterThan(0);
      const filteredParts = filterDetectedParts(allParts, 0.3);
      expect(filteredParts.length).toBeGreaterThan(0);
      expect(filteredParts.every((part) => part.confidence >= 0.3)).toBe(true);
      const expectedFaceParents = {
        bone_head: null,
        bone_eye_left: "bone_head",
        bone_eye_right: "bone_head",
        bone_eyebrow_left: "bone_head",
        bone_eyebrow_right: "bone_head",
        bone_mouth: "bone_head",
      };
      const expectedBodyParents = {
        bone_body: null,
        bone_arm_left: "bone_body",
        bone_arm_right: "bone_body",
      };
      const face = generateFaceBones(filteredParts, canvasWidth, canvasHeight);
      const body = generateBodyBones(filteredParts, canvasWidth, canvasHeight);
      expect(
        Object.fromEntries(face.bones.map((bone) => [bone.tempId, bone.parentTempId])),
      ).toEqual(expectedFaceParents);
      expect(
        Object.fromEntries(body.bones.map((bone) => [bone.tempId, bone.parentTempId])),
      ).toEqual(expectedBodyParents);
      const boneResult = generateAllBones(filteredParts, canvasWidth, canvasHeight);
      expect(boneResult.bones).toHaveLength(9);
      expect(new Set(boneResult.bones.map((bone) => bone.tempId)).size).toBe(9);
      expect(
        Object.fromEntries(
          boneResult.bones.map((bone) => [bone.tempId, bone.parentTempId]),
        ),
      ).toEqual({
        ...expectedBodyParents,
        ...expectedFaceParents,
        bone_head: "bone_body",
      });
      expect(
        boneResult.bones.find((bone) => bone.tempId === "bone_head")!.partCategory,
      ).toBe("head");
      expect(boneResult.parameters.length).toBeGreaterThan(0);
      const physicsGroups = generatePhysicsGroups(filteredParts);
      expect(physicsGroups.map((group) => [group.partCategory, group.layerIds])).toEqual([
        ["hairFront", [layers[1]!.id]],
        ["hairBack", [layers[2]!.id]],
        ["hairSide", [layers[3]!.id]],
      ]);
      for (const group of physicsGroups) {
        expect(group.name.length).toBeGreaterThan(0);
        for (const value of [group.stiffness, group.gravity, group.damping]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("検出結果をrefineByPositionで補正後にボーン生成する", () => {
    it("unknown パーツが位置ベースで補正される", () => {
      const unknownLayer = createViviMesh({
        name: "装飾パーツA",
        x: 960,
        y: 100,
        width: 50,
        height: 50,
      });
      const unknownLayerBody = createViviMesh({
        name: "装飾パーツB",
        x: 960,
        y: 500,
        width: 50,
        height: 50,
      });

      const layers: LayerNode[] = [unknownLayer, unknownLayerBody];
      const parts = detectParts(layers);

      expect(parts.every((p) => p.category === "unknown")).toBe(true);

      const refined = refineByPosition(parts, 1920, 1080);

      const upperPart = refined.find((p) => p.layerId === unknownLayer.id);
      expect(upperPart?.category).toBe("head");
      expect(upperPart?.confidence).toBeGreaterThan(0);

      const middlePart = refined.find((p) => p.layerId === unknownLayerBody.id);
      expect(middlePart?.category).toBe("body");

      const boneResult = generateAllBones(refined, 1920, 1080);
      expect(boneResult.bones.length).toBeGreaterThan(0);
    });
  });

  describe("物理グループの推奨パラメータ", () => {
    it("アクセサリの物理グループが生成される", () => {
      const { layers } = createVTuberLayerTree();
      const parts = filterDetectedParts(detectParts(layers), 0.1);
      const physicsGroups = generatePhysicsGroups(parts);

      const accGroups = physicsGroups.filter((g) => g.partCategory === "accessory");
      expect(accGroups.length).toBeGreaterThan(0);
      expect(accGroups[0]!.name).toContain("Accessory");
    });
  });

  describe("ボーン階層の完全性検証", () => {
    it("顔のみ検出された場合のボーン階層", () => {
      const layers: LayerNode[] = [
        createViviMesh({ name: "左目", x: 400, y: 200, width: 80, height: 40 }),
        createViviMesh({ name: "右目", x: 600, y: 200, width: 80, height: 40 }),
        createViviMesh({ name: "口", x: 480, y: 300, width: 60, height: 30 }),
      ];
      const parts = filterDetectedParts(detectParts(layers), 0.3);
      const result = generateAllBones(parts, 1920, 1080);

      expect(result.bones.some((b) => b.tempId === "bone_body")).toBe(true);
      expect(result.bones.some((b) => b.tempId === "bone_head")).toBe(true);
      const head = result.bones.find((b) => b.tempId === "bone_head")!;
      expect(head.parentTempId).toBe("bone_body");
    });

    it("体のみ検出された場合のボーン階層", () => {
      const layers: LayerNode[] = [
        createViviMesh({ name: "体", x: 400, y: 400, width: 300, height: 400 }),
        createViviMesh({ name: "左腕", x: 200, y: 450, width: 150, height: 250 }),
      ];
      const parts = filterDetectedParts(detectParts(layers), 0.3);
      const result = generateAllBones(parts, 1920, 1080);

      const body = result.bones.find((b) => b.tempId === "bone_body")!;
      expect(body.parentTempId).toBeNull();
      const armL = result.bones.find((b) => b.tempId === "bone_arm_left");
      if (armL) {
        expect(armL.parentTempId).toBe("bone_body");
      }
      const head = result.bones.find((b) => b.tempId === "bone_head")!;
      expect(head.parentTempId).toBe("bone_body");
    });

    it("ボーン親子階層がBBWウェイト計算にparentIdとして渡される", async () => {
      const vertices = [0, 0, 100, 0, 50, 100];
      const indices = [0, 1, 2];
      const weights = [
        [{ boneId: "root", weight: 1 }],
        [{ boneId: "child", weight: 1 }],
        [
          { boneId: "root", weight: 0.25 },
          { boneId: "child", weight: 0.75 },
        ],
      ];
      const solve = vi
        .spyOn(bbwClient, "computeBBWWeightsAsync")
        .mockResolvedValue(weights);
      try {
        const result = await generateAutoWeights(
          [
            {
              layerId: "test",
              layerName: "テスト",
              mesh: {
                vertices,
                indices,
                uvs: [0, 0, 1, 0, 0.5, 1],
                divisionsX: 0,
                divisionsY: 0,
              },
            },
          ],
          [
            {
              tempId: "root",
              name: "体",
              parentTempId: null,
              x: 12,
              y: 34,
              partCategory: "body",
            },
            {
              tempId: "child",
              name: "頭",
              parentTempId: "root",
              x: 56,
              y: 78,
              partCategory: "head",
            },
          ],
        );
        expect(solve).toHaveBeenCalledExactlyOnceWith(
          vertices,
          indices,
          [
            { id: "root", parentId: null, x: 12, y: 34 },
            { id: "child", parentId: "root", x: 56, y: 78 },
          ],
          undefined,
          { signal: undefined },
        );
        expect(result).toEqual([
          { layerId: "test", weights, boneIds: ["root", "child"], solver: "bbw" },
        ]);
        expect(result[0]!.weights).toBe(weights);
      } finally {
        solve.mockRestore();
      }
    });
  });

  describe("パーツ未検出のフォールバック", () => {
    it("パーツ未検出でもボーン生成が安全にフォールバックする", () => {
      const layers: LayerNode[] = [
        createViviMesh({ name: "レイヤー1", x: 0, y: 0, width: 100, height: 100 }),
        createViviMesh({ name: "レイヤー2", x: 100, y: 100, width: 100, height: 100 }),
      ];

      const parts = detectParts(layers);
      expect(parts.every((p) => p.category === "unknown")).toBe(true);

      const filtered = filterDetectedParts(parts, 0.3);
      expect(filtered).toHaveLength(0);

      const result = generateAllBones(filtered, 800, 600);
      expect(result.bones.length).toBeGreaterThan(0);
      const headBone = result.bones.find((b) => b.tempId === "bone_head");
      expect(headBone).toBeDefined();
      expect(headBone!.x).toBeCloseTo(400, 0); // canvasWidth/2
    });

    it("パーツ未検出で物理グループは空配列が返る", () => {
      const layers: LayerNode[] = [createViviMesh({ name: "レイヤー1" })];

      const parts = detectParts(layers);
      const filtered = filterDetectedParts(parts, 0.3);
      const physicsGroups = generatePhysicsGroups(filtered);

      expect(physicsGroups).toHaveLength(0);
    });

    it("detectSwayingPartsが非揺れパーツを除外する", () => {
      const parts: DetectedPart[] = [
        {
          layerId: "l1",
          layerName: "頭",
          category: "head",
          confidence: 0.8,
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          layerId: "l2",
          layerName: "体",
          category: "body",
          confidence: 0.7,
          bounds: { x: 0, y: 100, width: 100, height: 200 },
        },
        {
          layerId: "l3",
          layerName: "前髪",
          category: "hairFront",
          confidence: 0.9,
          bounds: { x: 0, y: 0, width: 100, height: 50 },
        },
      ];

      const swaying = detectSwayingParts(parts);
      expect(swaying).toHaveLength(1);
      expect(swaying[0]!.category).toBe("hairFront");
    });
  });
});
