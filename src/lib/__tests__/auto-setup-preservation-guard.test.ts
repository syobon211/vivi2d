import { describe, expect, it } from "vitest";
import type { AutoSetupResult, MeshGenerationResult } from "@/lib/auto-setup";
import {
  assessAutoSetupWeightPreservationRisk,
  guardAutoSetupWeightResults,
} from "@/lib/auto-setup-preservation-guard";
import { createEmptyProject, createViviMesh } from "@/test/fixtures";

const mesh: MeshGenerationResult = {
  layerId: "manual-png",
  layerName: "manual-png",
  mesh: {
    vertices: [0, 0, 100, 0, 0, 100, 100, 100],
    uvs: [0, 0, 1, 0, 0, 1, 1, 1],
    indices: [0, 1, 2, 1, 3, 2],
    divisionsX: 1,
    divisionsY: 1,
  },
};

function createManualPngProject() {
  return {
    ...createEmptyProject(),
    sourceKind: "manualPng" as const,
    layers: [
      createViviMesh({
        id: "manual-png",
        width: 100,
        height: 100,
        importMetadata: {
          source: "manualPng",
          manualPng: {
            sourceFileName: "character.png",
            originalWidth: 100,
            originalHeight: 100,
            trimmedBounds: [0, 0, 100, 100],
            finalOrigin: [0, 0],
            placementMode: "preserveImageOffset",
            autoGenerateMeshApplied: false,
          },
        },
      }),
    ],
  };
}

function createResult(lowerBodyHeadInfluence: number): AutoSetupResult {
  return {
    detectedParts: [],
    boneResult: {
      bones: [
        {
          tempId: "bone_body",
          name: "body",
          parentTempId: null,
          x: 50,
          y: 70,
          partCategory: "body",
        },
        {
          tempId: "bone_head",
          name: "head",
          parentTempId: "bone_body",
          x: 50,
          y: 20,
          partCategory: "head",
        },
      ],
      parameters: [],
    },
    physicsGroups: [],
    meshResults: [mesh],
    weightResults: [
      {
        layerId: "manual-png",
        boneIds: ["bone_body", "bone_head"],
        weights: [
          [{ boneId: "bone_head", weight: 1 }],
          [{ boneId: "bone_head", weight: 1 }],
          [
            { boneId: "bone_head", weight: lowerBodyHeadInfluence },
            { boneId: "bone_body", weight: 1 - lowerBodyHeadInfluence },
          ],
          [
            { boneId: "bone_head", weight: lowerBodyHeadInfluence },
            { boneId: "bone_body", weight: 1 - lowerBodyHeadInfluence },
          ],
        ],
      },
    ],
  };
}

describe("auto setup preservation guard", () => {
  it("skips risky flat manual PNG weights when head influence leaks into the body", () => {
    const project = createManualPngProject();
    const result = createResult(0.35);

    const guard = guardAutoSetupWeightResults(project, result);

    expect(guard.skippedWeightLayerIds).toEqual(["manual-png"]);
    expect(guard.weightResults).toEqual([]);
    expect(guard.risks[0]?.risky).toBe(true);
    expect(guard.risks[0]?.lowerRegionMaxHeadInfluence).toBeGreaterThan(0.12);
  });

  it("keeps safe flat manual PNG weights below the leakage threshold", () => {
    const project = createManualPngProject();
    const result = createResult(0);

    const risk = assessAutoSetupWeightPreservationRisk(
      project,
      result,
      result.weightResults[0]!,
    );
    const guard = guardAutoSetupWeightResults(project, result);

    expect(risk.risky).toBe(false);
    expect(guard.skippedWeightLayerIds).toEqual([]);
    expect(guard.weightResults).toHaveLength(1);
  });

  it("does not gate regular multi-layer projects", () => {
    const project = {
      ...createEmptyProject(),
      sourceKind: "psd" as const,
      layers: [
        createViviMesh({ id: "body", width: 100, height: 100 }),
        createViviMesh({ id: "head", width: 100, height: 100 }),
      ],
    };
    const result = createResult(0.35);

    const guard = guardAutoSetupWeightResults(project, result);

    expect(guard.skippedWeightLayerIds).toEqual([]);
    expect(guard.weightResults).toHaveLength(1);
    expect(guard.risks[0]?.reason).toBe("notFlatManualPng");
  });
});
