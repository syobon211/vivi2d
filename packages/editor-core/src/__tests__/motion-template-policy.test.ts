import { describe, expect, it } from "vitest";
import type { ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import {
  createLocalMotionDraftFromProject,
  compileLocalMotionDraftToSafeAutoSetupOperations,
} from "../local-motion";
import {
  getMotionSemanticPolicy,
  isProtectedMotionSemantic,
} from "../motion-template-policy";

function meshLayer(overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  return {
    id: "layer",
    name: "Layer",
    kind: "viviMesh",
    visible: true,
    opacity: 1,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    blendMode: "normal",
    expanded: true,
    children: [],
    semanticRole: "hairFront",
    mesh: {
      vertices: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 1,
      divisionsY: 1,
    },
    manualSplitOutputMetadata: {
      kind: "maskExtractedLayer",
      ownership: "userAccepted",
      origin: "manualMask",
      manualSplitLayerId: "split-layer",
      manualSplitSourceLayerId: "source-png",
      manualSplitSourceFingerprint: "sha256:source",
      manualSplitMaskId: "mask-layer",
      maskCoverage: 0.4,
      edgeFeatherPx: 1,
    },
    ...overrides,
  };
}

function project(layer: ViviMeshNode): ProjectData {
  return {
    name: "motion-policy-test",
    width: 512,
    height: 512,
    layers: [layer],
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
      gain: 1,
    },
    skins: {},
    colliders: [],
    stateMachines: [],
  };
}

describe("motion template policy", () => {
  it("marks face, eyes, and mouth as protected rigid defaults", () => {
    for (const role of ["face", "eyeLeft", "eyeRight", "mouth"] as const) {
      const policy = getMotionSemanticPolicy(role);
      expect(policy).toMatchObject({
        defaultMotionKind: "rigid",
        protected: true,
        maxRotationDeg: 0,
        maxDisplacementPxRatio: 0,
      });
      expect(isProtectedMotionSemantic(role)).toBe(true);
    }
  });

  it("uses head-adjacent root priority for front hair", () => {
    const policy = getMotionSemanticPolicy("hairFront");

    expect(policy.defaultMotionKind).toBe("secondaryMotion");
    expect(policy.rootAnchorPriority[0]).toBe("headAdjacent");
    expect(policy.maxRotationDeg).toBeLessThanOrEqual(8);
  });

  it("uses parent attachment before farthest tip for tails", () => {
    const policy = getMotionSemanticPolicy("tail");

    expect(policy.rootAnchorPriority).toEqual(
      expect.arrayContaining(["parentLayerAdjacent", "attachmentPoint"]),
    );
    expect(policy.tipPriority[0]).toBe("farthestFromRoot");
  });

  it("defaults small accessories near face to rigid manual review", () => {
    const policy = getMotionSemanticPolicy("accessory", {
      nearProtectedFace: true,
      smallAccessory: true,
    });

    expect(policy).toMatchObject({
      defaultMotionKind: "rigid",
      physicsPreset: "none",
      requireUserOptIn: true,
      maxRotationDeg: 0,
    });
  });

  it("safe auto setup respects semantic policy motion kind", () => {
    const sourceProject = project(meshLayer({ semanticRole: "face" }));
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      draft,
    );

    expect(draft.regions[0]).toMatchObject({
      protected: true,
      riggingHint: "rigid",
      motionBudget: expect.objectContaining({ strength: 0 }),
    });
    expect(compiled.operations).toEqual([]);
  });
});
