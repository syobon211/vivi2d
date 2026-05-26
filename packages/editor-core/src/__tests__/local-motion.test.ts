import { describe, expect, it } from "vitest";
import type { LayerSemanticRole, ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import {
  assertNoEditorPreviewFields,
  compileLocalMotionDraftToSafeAutoSetupOperations,
  createEditorOnlyPreview,
  createLocalMotionAcceptedMaskFingerprint,
  createLocalMotionDraftFromProject,
  validateLocalMotionDraft,
} from "../local-motion";
import type { LocalMotionAcceptedManualMask } from "../local-motion";

const SOURCE_FINGERPRINT =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VERSIONED_SOURCE_FINGERPRINT =
  "sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

function acceptedMask(
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
): LocalMotionAcceptedManualMask {
  const alpha = alphaMask(width, height, rects);
  const fingerprint = createLocalMotionAcceptedMaskFingerprint(width, height, alpha);
  if (!fingerprint) throw new Error("test mask fingerprint must be valid");
  return { width, height, alpha, fingerprint };
}

function meshLayer(overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  return {
    id: "hair-front",
    name: "Front Hair",
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
      manualSplitLayerId: "split-hair-front",
      manualSplitSourceLayerId: "source-png",
      manualSplitSourceFingerprint: SOURCE_FINGERPRINT,
      manualSplitMaskId: "mask-hair-front",
      maskCoverage: 0.4,
      edgeFeatherPx: 1,
    },
    ...overrides,
  };
}

function splitLayer(
  id: string,
  semanticRole: ViviMeshNode["semanticRole"],
  overrides: Partial<ViviMeshNode> = {},
): ViviMeshNode {
  return meshLayer({
    id,
    semanticRole,
    manualSplitOutputMetadata: {
      ...meshLayer().manualSplitOutputMetadata!,
      manualSplitLayerId: `split-${id}`,
      manualSplitMaskId: `mask-${id}`,
    },
    ...overrides,
  });
}

function project(layers: ViviMeshNode[]): ProjectData {
  return {
    name: "local-motion-test",
    width: 512,
    height: 512,
    layers,
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

function acceptedMotionHandle(
  region: {
    id: string;
    semanticRole: LayerSemanticRole;
    acceptedMaskAlphaHash?: string;
    acceptedMaskPlacementHash?: string;
    sourceMaskBytesHash?: string;
    protectedRegionSetHash?: string;
    acceptedMaskAlphaFingerprintHint?: string;
  },
  overrides: Record<string, unknown> = {},
) {
  return {
    kind: "userAcceptedMotionHandle" as const,
    id: `accepted:${region.id}`,
    regionId: region.id,
    role: region.semanticRole,
    root: { x: 60, y: 20, source: "manualReview" as const },
    tip: { x: 60, y: 100, source: "manualReview" as const },
    acceptedAt: "2026-05-18T00:00:00.000Z",
    sourceMaskFingerprint: VERSIONED_SOURCE_FINGERPRINT,
    sourceMaskBytesHash: region.sourceMaskBytesHash,
    acceptedMaskAlphaHash: region.acceptedMaskAlphaHash,
    acceptedMaskPlacementHash: region.acceptedMaskPlacementHash,
    protectedRegionSetHash: region.protectedRegionSetHash,
    acceptedMaskFingerprint: region.acceptedMaskAlphaFingerprintHint,
    semanticPolicyId: "policy.semantic.v1.secondary",
    semanticPolicyVersion: 1,
    motionBudgetBucket: "medium" as const,
    acceptedFromSuggestionStatus: "review" as const,
    ...overrides,
  };
}

describe("editor-core local motion", () => {
  it("creates editor-only motion regions from accepted manual split layers", () => {
    const draft = createLocalMotionDraftFromProject(project([meshLayer()]), {
      baseProjectRevision: "project-rev-1",
      baseTextureStoreRevision: "texture-rev-1",
      sourceLayerRevisions: { "hair-front": "layer-rev-1" },
      sourceTextureRevisions: { "hair-front": "texture-rev-1" },
    });

    expect(draft.regions).toHaveLength(1);
    expect(draft.manualSplitSources).toHaveLength(1);
    expect(draft.handles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ semantic: "pin", kind: "pin" }),
      ]),
    );
    expect(draft.regions[0]).toMatchObject({
      layerId: "hair-front",
      semanticRole: "hairFront",
      riggingHint: "localBones",
      protected: false,
      sourceManualSplitMaskId: "mask-hair-front",
      handleSuggestion: expect.objectContaining({
        status: "review",
        autoApplicable: false,
      }),
    });
    expect(draft.manualSplitSources[0]).toMatchObject({
      sourceLayerId: "hair-front",
      sourceLayerRevision: "layer-rev-1",
      sourceTextureRevision: "texture-rev-1",
      manualSplitSourceLayerId: "source-png",
    });
  });

  it("keeps protected face semantics rigid with zero motion strength", () => {
    const draft = createLocalMotionDraftFromProject(
      project([
        meshLayer({
          id: "face",
          name: "Face",
          semanticRole: "face",
          manualSplitOutputMetadata: {
            ...meshLayer().manualSplitOutputMetadata!,
            manualSplitLayerId: "split-face",
            manualSplitMaskId: "mask-face",
          },
        }),
      ]),
    );

    expect(draft.regions[0]).toMatchObject({
      riggingHint: "rigid",
      protected: true,
      motionBudget: expect.objectContaining({ strength: 0 }),
    });
    expect(validateLocalMotionDraft(draft).ok).toBe(true);
  });

  it("excludes generated underpaint layers from motion regions", () => {
    const draft = createLocalMotionDraftFromProject(
      project([
        meshLayer({
          id: "underpaint",
          name: "Generated Underpaint",
          semanticRole: "face",
          manualSplitOutputMetadata: {
            kind: "generatedUnderpaintLayer",
            ownership: "userAccepted",
            origin: "localUnderpaint",
            manualSplitLayerId: "underpaint-layer",
            manualSplitSourceLayerId: "source-png",
            manualSplitSourceFingerprint: "sha256:source",
            underpaintBufferId: "underpaint-1",
            bounds: { x: 0, y: 0, width: 32, height: 32 },
            acceptedAt: "2026-05-18T00:00:00.000Z",
          },
        }),
      ]),
    );

    expect(draft.regions).toEqual([]);
    expect(draft.handles).toEqual([]);
  });

  it("does not compile region-bounds pseudo-mask suggestions automatically", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      draft,
    );

    expect(compiled.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalidOperationShape",
          severity: "warning",
        }),
      ]),
    );
    expect(draft.regions[0]!.handleSuggestion).toEqual(
      expect.objectContaining({ status: "review", autoApplicable: false }),
    );
    expect(compiled.operations).toEqual([]);
    expect(compiled.skippedRegionIds).toEqual([draft.regions[0]!.id]);
  });

  it("uses accepted manual mask bytes for auto-applicable motion handles", () => {
    const hair = splitLayer("hair-front", "hairFront", {
      x: 10,
      y: 24,
      width: 48,
      height: 64,
    });
    const head = splitLayer("head", "head", {
      x: 10,
      y: 0,
      width: 48,
      height: 24,
    });
    const sourceProject = project([head, hair]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": acceptedMask(24, 32, [
          { x: 10, y: 8, width: 4, height: 16 },
        ]),
      },
    });
    const region = draft.regions.find(
      (candidate) => candidate.layerId === "hair-front",
    )!;

    expect(region.handleSuggestion).toEqual(
      expect.objectContaining({
        status: "apply",
        autoApplicable: true,
      }),
    );
    if (region.handleSuggestion?.status === "apply") {
      expect(region.handleSuggestion.root.x).toBeGreaterThanOrEqual(region.bounds.x);
      expect(region.handleSuggestion.root.x).toBeLessThanOrEqual(
        region.bounds.x + region.bounds.width,
      );
      expect(region.handleSuggestion.root.y).toBeLessThan(
        region.handleSuggestion.tip.y,
      );
    }
    expect(draft.handles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          regionId: region.id,
          semantic: "root",
          acceptedMotionHandle: expect.objectContaining({
            sourceMaskFingerprint: VERSIONED_SOURCE_FINGERPRINT,
            acceptedMaskAlphaHash: region.acceptedMaskAlphaHash,
            acceptedMaskPlacementHash: region.acceptedMaskPlacementHash,
          }),
        }),
        expect.objectContaining({
          regionId: region.id,
          semantic: "tip",
          acceptedMotionHandle: expect.objectContaining({
            sourceMaskFingerprint: VERSIONED_SOURCE_FINGERPRINT,
            acceptedMaskAlphaHash: region.acceptedMaskAlphaHash,
            acceptedMaskPlacementHash: region.acceptedMaskPlacementHash,
          }),
        }),
      ]),
    );

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      draft,
    );

    expect(compiled.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createSkin",
          layerId: "hair-front",
          solver: "secondaryMotion",
        }),
      ]),
    );
  });

  it("rejects invalid accepted manual mask bytes instead of falling back to pseudo masks", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": {
          width: 48,
          height: 64,
          alpha: new Uint8Array(3),
        },
      },
    });
    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      draft,
    );

    expect(draft.regions[0]?.handleSuggestion).toEqual(
      expect.objectContaining({
        status: "rejected",
        autoApplicable: false,
        reasons: expect.arrayContaining(["inputRejected"]),
      }),
    );
    expect(compiled.operations).toEqual([]);
  });

  it("compiles user-accepted motion handles to safe controller-rig operations only", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": acceptedMask(24, 32, [
          { x: 10, y: 8, width: 4, height: 16 },
        ]),
      },
    });
    const region = draft.regions[0]!;
    const acceptedDraft = {
      ...draft,
      handles: [
        {
          id: "accepted:root",
          regionId: region.id,
          kind: "bone" as const,
          name: "accepted root",
          anchor: { x: region.bounds.x + region.bounds.width / 2, y: region.bounds.y },
          tip: {
            x: region.bounds.x + region.bounds.width / 2,
            y: region.bounds.y + region.bounds.height,
          },
          semantic: "root" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: acceptedMotionHandle(region),
        },
        {
          id: "accepted:tip",
          regionId: region.id,
          kind: "bone" as const,
          name: "accepted tip",
          anchor: {
            x: region.bounds.x + region.bounds.width / 2,
            y: region.bounds.y + region.bounds.height,
          },
          parentHandleId: "accepted:root",
          semantic: "tip" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: acceptedMotionHandle(region),
        },
      ],
    };
    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      acceptedDraft,
    );

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.operations.map((operation) => operation.kind)).toEqual([
      "addBone",
      "addBone",
      "parentBone",
      "createSkin",
    ]);
    expect(compiled.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "createSkin",
          layerId: "hair-front",
          solver: "secondaryMotion",
        }),
      ]),
    );
    expect(JSON.stringify(compiled.operations)).not.toMatch(/previewOnly|mls|arap/i);
  });

  it("does not compile unaccepted root-tip handles", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const region = draft.regions[0]!;
    const unacceptedDraft = {
      ...draft,
      handles: [
        {
          id: "unaccepted:root",
          regionId: region.id,
          kind: "bone" as const,
          name: "unaccepted root",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 10 },
          semantic: "root" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
        },
        {
          id: "unaccepted:tip",
          regionId: region.id,
          kind: "bone" as const,
          name: "unaccepted tip",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 80 },
          parentHandleId: "unaccepted:root",
          semantic: "tip" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
        },
      ],
    };

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      unacceptedDraft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.skippedRegionIds).toEqual([region.id]);
  });

  it("does not compile accepted handles with stale or invalid fingerprints", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": acceptedMask(24, 32, [
          { x: 10, y: 8, width: 4, height: 16 },
        ]),
      },
    });
    const region = draft.regions[0]!;
    const staleAcceptance = {
      ...acceptedMotionHandle(region),
      sourceMaskFingerprint:
        "sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
    };
    const invalidStatusAcceptance = {
      ...acceptedMotionHandle(region),
      acceptedFromSuggestionStatus: "unknown",
    };
    const staleDraft = {
      ...draft,
      handles: [
        {
          id: "stale:root",
          regionId: region.id,
          kind: "bone" as const,
          name: "stale root",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 10 },
          semantic: "root" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: staleAcceptance,
        },
        {
          id: "stale:tip",
          regionId: region.id,
          kind: "bone" as const,
          name: "stale tip",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 80 },
          parentHandleId: "stale:root",
          semantic: "tip" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: invalidStatusAcceptance as never,
        },
      ],
    };

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      staleDraft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.skippedRegionIds).toEqual([region.id]);
  });

  it("does not compile accepted handles when the accepted mask alpha fingerprint changed", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": acceptedMask(24, 32, [
          { x: 10, y: 8, width: 4, height: 16 },
        ]),
      },
    });
    const region = draft.regions[0]!;
    const staleMaskAcceptance = {
      ...acceptedMotionHandle(region, {
        acceptedMaskAlphaHash:
          "sha256:v1:maskAlphaCanonical.v2:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    };
    const staleDraft = {
      ...draft,
      handles: [
        {
          id: "stale-mask:root",
          regionId: region.id,
          kind: "bone" as const,
          name: "stale mask root",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 10 },
          semantic: "root" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: staleMaskAcceptance,
        },
        {
          id: "stale-mask:tip",
          regionId: region.id,
          kind: "bone" as const,
          name: "stale mask tip",
          anchor: { x: region.bounds.x + 10, y: region.bounds.y + 80 },
          parentHandleId: "stale-mask:root",
          semantic: "tip" as const,
          radiusPx: 8,
          constraints: draft.handles[0]!.constraints,
          acceptedMotionHandle: staleMaskAcceptance,
        },
      ],
    };

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      staleDraft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.skippedRegionIds).toEqual([region.id]);
  });

  it("collapses degenerate root-tip handles to a single weighted bone", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject, {
      acceptedManualMasks: {
        "hair-front": acceptedMask(24, 32, [
          { x: 10, y: 8, width: 4, height: 16 },
        ]),
      },
    });
    const region = draft.regions[0]!;
    const root = {
      id: "accepted:root",
      regionId: region.id,
      kind: "bone" as const,
      name: "accepted root",
      anchor: { x: region.bounds.x + 10, y: region.bounds.y + 10 },
      semantic: "root" as const,
      radiusPx: 8,
      constraints: draft.handles[0]!.constraints,
      acceptedMotionHandle: acceptedMotionHandle(region),
    };
    const tip = {
      id: "accepted:tip",
      regionId: region.id,
      kind: "bone" as const,
      name: "accepted tip",
      anchor: { x: region.bounds.x + 10, y: region.bounds.y + 10 },
      parentHandleId: "accepted:root",
      semantic: "tip" as const,
      radiusPx: 8,
      constraints: draft.handles[0]!.constraints,
      acceptedMotionHandle: acceptedMotionHandle(region),
    };
    const collapsedDraft = {
      ...draft,
      handles: [root, tip],
    };

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      collapsedDraft,
    );
    const skin = compiled.operations.find(
      (operation) => operation.kind === "createSkin",
    );

    expect(compiled.operations.map((operation) => operation.kind)).toEqual([
      "addBone",
      "createSkin",
    ]);
    expect(skin).toEqual(
      expect.objectContaining({
        kind: "createSkin",
        boneIds: [expect.stringContaining("root")],
      }),
    );
  });

  it("rejects non-finite handle coordinates and invalid constraints", () => {
    const draft = createLocalMotionDraftFromProject(project([meshLayer()]));
    const firstHandle = draft.handles[0]!;
    const validation = validateLocalMotionDraft({
      ...draft,
      handles: draft.handles.map((handle) =>
        handle.id === firstHandle.id
          ? {
              ...handle,
              anchor: { x: Number.NaN, y: handle.anchor.y },
              constraints: {
                ...handle.constraints,
                maxTranslationPx: -1,
                maxRotationDeg: Number.POSITIVE_INFINITY,
                minScale: 1.2,
                maxScale: 1,
                preserveAreaRatio: 0,
              },
            }
          : handle,
      ),
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        "handles[0].anchor.x",
        "handles[0].constraints.maxTranslationPx",
        "handles[0].constraints.maxRotationDeg",
        "handles[0].constraints",
        "handles[0].constraints.preserveAreaRatio",
      ]),
    );
  });

  it("blocks apply when the split source fingerprint changed after draft creation", () => {
    const sourceProject = project([meshLayer()]);
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const changedProject = project([
      meshLayer({
        manualSplitOutputMetadata: {
          ...meshLayer().manualSplitOutputMetadata!,
          manualSplitSourceFingerprint: "sha256:changed",
        },
      }),
    ]);

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      changedProject,
      draft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "sourceFingerprintMismatch" }),
      ]),
    );
  });

  it("blocks apply when managed rig references drift after draft creation", () => {
    const sourceProject = project([
      meshLayer({
        managedTag: "safeAutoSetup:v1:mesh:hair-front",
        managedSignature: "sig-base",
      }),
    ]);
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const changedProject = project([
      meshLayer({
        managedTag: "safeAutoSetup:v1:mesh:hair-front",
        managedSignature: "sig-user-edit",
      }),
    ]);

    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      changedProject,
      draft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "userModified" })]),
    );
  });

  it("does not compile protected regions into moving skin output", () => {
    const sourceProject = project([
      meshLayer({
        id: "face",
        name: "Face",
        semanticRole: "face",
        manualSplitOutputMetadata: {
          ...meshLayer().manualSplitOutputMetadata!,
          manualSplitLayerId: "split-face",
          manualSplitMaskId: "mask-face",
        },
      }),
    ]);
    const draft = createLocalMotionDraftFromProject(sourceProject);
    const compiled = compileLocalMotionDraftToSafeAutoSetupOperations(
      sourceProject,
      draft,
    );

    expect(compiled.operations).toEqual([]);
    expect(compiled.skippedRegionIds).toEqual([draft.regions[0]!.id]);
  });

  it("rejects protected invariant drift", () => {
    const draft = createLocalMotionDraftFromProject(project([meshLayer()]));
    draft.regions[0]!.semanticRole = "face";
    draft.regions[0]!.protected = false;

    const validation = validateLocalMotionDraft(draft);

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "protectedInvariantMismatch" }),
      ]),
    );
  });

  it("rejects editor-only preview fields before serialization", () => {
    expect(() =>
      assertNoEditorPreviewFields({
        project: {
          previewSolvers: [{ id: "solver" }],
        },
      }),
    ).toThrow(/editor-only preview/);
    expect(() =>
      assertNoEditorPreviewFields(createEditorOnlyPreview({ id: "preview" })),
    ).toThrow(/branded editor-only preview/);
    expect(() =>
      assertNoEditorPreviewFields({ frame: new Float32Array([0, 1]) }),
    ).toThrow(/binary editor-only preview/);
    expect(() =>
      assertNoEditorPreviewFields({ "preview-only": true }),
    ).toThrow(/editor-only preview/);
    expect(() =>
      assertNoEditorPreviewFields({ status: "editorPreviewFrame" }),
    ).toThrow(/editor-only preview/);
  });

  it("snapshots existing managed rig revisions for stale apply checks", () => {
    const sourceProject = project([
      meshLayer({
        managedTag: "safeAutoSetup:v1:mesh:hair-front",
        managedSignature: "sig-live",
      }),
    ]);

    const draft = createLocalMotionDraftFromProject(sourceProject);

    expect(Object.keys(draft.managedRigBackReferenceRevisions)).toEqual(
      expect.arrayContaining(["node:hair-front"]),
    );
  });
});
