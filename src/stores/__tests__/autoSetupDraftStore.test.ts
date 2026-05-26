import { beforeEach, describe, expect, it } from "vitest";
import {
  buildAutoSetupDraftProjectKey,
  useAutoSetupDraftStore,
} from "@/stores/autoSetupDraftStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { TEST_MODEL_VIVI_PATH } from "@/test/path-fixtures";

describe("autoSetupDraftStore", () => {
  beforeEach(() => {
    useAutoSetupDraftStore.setState({ draft: null });
  });

  it("returns a compatible draft for the same project key and structure version", () => {
    const project = {
      ...createEmptyProject(),
      width: 200,
      height: 100,
      layers: [createViviMesh({ id: "mesh-a" }), createViviMesh({ id: "mesh-b" })],
    };
    const projectKey = buildAutoSetupDraftProjectKey(project, TEST_MODEL_VIVI_PATH, 3);

    useAutoSetupDraftStore.getState().saveDraft({
      projectKey,
      projectStructureVersion: 4,
      step: "options",
      experienceMode: "advanced",
      options: {
        generateBones: true,
        generatePhysics: false,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "fine",
        minConfidence: 0.5,
      },
      excludedIds: ["mesh-b"],
      result: null,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: true,
    });

    const draft = useAutoSetupDraftStore.getState().getCompatibleDraft(projectKey, 4);

    expect(draft?.step).toBe("options");
    expect(draft?.experienceMode).toBe("advanced");
    expect(draft?.excludedIds).toEqual(["mesh-b"]);
    expect(draft?.options.meshPreset).toBe("fine");
  });

  it("clears a stale draft when the project key or structure version mismatches", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a" })],
    };
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);

    useAutoSetupDraftStore.getState().saveDraft({
      projectKey,
      projectStructureVersion: 2,
      step: "detect",
      experienceMode: "beginner",
      options: {
        generateBones: true,
        generatePhysics: true,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "standard",
        minConfidence: 0.3,
      },
      excludedIds: [],
      result: null,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: false,
    });

    expect(
      useAutoSetupDraftStore.getState().getCompatibleDraft(`${projectKey}:other`, 2),
    ).toBeNull();
    expect(useAutoSetupDraftStore.getState().draft).toBeNull();
  });

  it("does not invalidate the draft key just because managed Auto Setup bones exist", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a" })],
    };
    const projectWithGeneratedBone = {
      ...project,
      layers: [
        ...project.layers,
        {
          id: "bone-managed",
          name: "Managed Head",
          kind: "bone" as const,
          visible: true,
          opacity: 1,
          x: 50,
          y: 40,
          width: 0,
          height: 0,
          children: [],
          blendMode: "normal" as const,
          expanded: true,
          bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
          managedTag: "safeAutoSetup:v1:bone:managed_head",
        },
      ],
    };

    expect(buildAutoSetupDraftProjectKey(projectWithGeneratedBone, null, 1)).toBe(
      buildAutoSetupDraftProjectKey(project, null, 1),
    );
  });

  it("rejects drafts with unsafe serialized Auto Setup plans", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a" }), createViviMesh({ id: "mesh-b" })],
    };
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);

    useAutoSetupDraftStore.getState().saveDraft({
      projectKey,
      projectStructureVersion: 1,
      step: "options",
      experienceMode: "beginner",
      options: {
        generateBones: true,
        generatePhysics: true,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "standard",
        minConfidence: 0.3,
      },
      excludedIds: [],
      result: {
        detectedParts: [],
        boneResult: null,
        physicsGroups: [],
        meshResults: [],
        weightResults: [],
        plan: {
          version: 1,
          profile: "safeAutoSetupV1",
          sourceFingerprint: "sha256:test",
          operations: [{ kind: "createFaceChannel" }],
          diagnostics: [],
        },
      } as never,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: false,
    });

    expect(useAutoSetupDraftStore.getState().draft).toBeNull();
    expect(useAutoSetupDraftStore.getState().getCompatibleDraft(projectKey, 1)).toBeNull();
  });

  it("strips transient motion handle drafts from saved auto setup drafts", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a" })],
    };
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);

    useAutoSetupDraftStore.getState().saveDraft({
      projectKey,
      projectStructureVersion: 1,
      step: "preview",
      experienceMode: "advanced",
      options: {
        generateBones: true,
        generatePhysics: true,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "standard",
        minConfidence: 0.3,
      },
      excludedIds: [],
      result: {
        detectedParts: [],
        boneResult: null,
        physicsGroups: [],
        meshResults: [],
        weightResults: [],
        motionHandleDraft: { id: "transient" },
      } as never,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: false,
    });

    const draft = useAutoSetupDraftStore.getState().getCompatibleDraft(projectKey, 1);

    expect(draft?.result).toBeTruthy();
    expect(draft?.result).not.toHaveProperty("motionHandleDraft");
  });

  it("rejects auto setup drafts containing editor-only preview fields", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "mesh-a" })],
    };
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);

    useAutoSetupDraftStore.getState().saveDraft({
      projectKey,
      projectStructureVersion: 1,
      step: "preview",
      experienceMode: "advanced",
      options: {
        generateBones: true,
        generatePhysics: true,
        generateMeshes: true,
        generateWeights: true,
        meshPreset: "standard",
        minConfidence: 0.3,
      },
      excludedIds: [],
      result: {
        detectedParts: [],
        boneResult: null,
        physicsGroups: [],
        meshResults: [],
        weightResults: [],
        previewSolvers: [],
      } as never,
      seeThroughRecommendationsApplied: false,
      cleanupSummary: null,
      eyeClippingSummary: null,
      eyeRigSummary: null,
      leftRightSplitSummary: null,
      mouthRigSummary: null,
      useOcclusionAwareMeshDensity: false,
    });

    expect(useAutoSetupDraftStore.getState().draft).toBeNull();
  });
});
