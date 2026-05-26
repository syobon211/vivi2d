import { findLayerById } from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import { isBone, isViviMesh } from "@vivi2d/core/types";
import {
  SAFE_AUTO_SETUP_PLAN_PROFILE,
  SAFE_AUTO_SETUP_PLAN_VERSION,
} from "@vivi2d/editor-core/safe-auto-setup-plan";
import { createLayerGraphFromProject } from "@vivi2d/editor-core/layer-graph";
import type { AutoSetupResult } from "@/lib/auto-setup";
import { applyAutoSetupResult } from "@/stores/autoSetupApplyWorkflow";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import {
  createBoneNode,
  createEmptyProject,
  createProject,
  createPhysicsGroup,
  createViviMesh,
} from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createResult(overrides: Partial<AutoSetupResult> = {}): AutoSetupResult {
  return {
    detectedParts: [],
    boneResult: null,
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
    ...overrides,
  };
}

describe("autoSetupApplyWorkflow", () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns noProject without mutating history when no project is loaded", async () => {
    const result = await applyAutoSetupResult({ result: createResult() });

    expect(result.status).toBe("noProject");
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("applies generated mesh data in a single history transaction", async () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    const generatedMesh = generateGridMesh(100, 100, 2, 2);
    generatedMesh.vertices[0] = 12;
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        meshResults: [
          {
            layerId: mesh.id,
            layerName: mesh.name,
            mesh: generatedMesh,
          },
        ],
      }),
    });

    const applied = findLayerById(
      useEditorStore.getState().project!.layers,
      mesh.id,
    );
    expect(result.status).toBe("applied");
    if (!applied || !isViviMesh(applied)) {
      throw new Error("Expected generated mesh to be applied to a ViviMesh.");
    }
    expect(applied.mesh.vertices[0]).toBe(12);
    expect(applied.managedTag).toBe(`safeAutoSetup:v1:mesh:${mesh.id}`);
    expect(useEditorStore.getState().projectStructureVersion).toBe(1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("remaps generated skin weights from temporary bones to real bones", async () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    const vertexCount = mesh.mesh.vertices.length / 2;
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 10,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [],
        },
        weightResults: [
          {
            layerId: mesh.id,
            boneIds: ["bone_head"],
            weights: Array.from({ length: vertexCount }, () => [
              { boneId: "bone_head", weight: 1 },
            ]),
          },
        ],
      }),
    });

    const project = useEditorStore.getState().project!;
    const generatedBone = project.layers.find((layer) => isBone(layer));
    const skin = project.skins[mesh.id];
    expect(result.status).toBe("applied");
    expect(generatedBone?.name).toBe("Head");
    expect(skin?.weights[0]).toEqual([
      { boneId: generatedBone?.id, weight: 1 },
    ]);
    expect(Object.keys(skin?.bindPoseInverse ?? {})).toEqual([
      generatedBone?.id,
    ]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it("applies generated parameters, physics groups, and controller bindings", async () => {
    useEditorStore.setState({
      project: createProject({ layers: [] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [
            {
              name: "Face X",
              minValue: -1,
              maxValue: 1,
              defaultValue: 0,
              group: "Face",
            },
          ],
        },
        physicsGroups: [
          {
            name: "Hair Sway",
            partCategory: "hair",
            layerIds: [],
            stiffness: 0.3,
            gravity: 0.5,
            damping: 0.4,
          },
        ],
      }),
    });

    const project = useEditorStore.getState().project!;
    const generatedBone = project.layers.find((layer) => isBone(layer));
    expect(result.status).toBe("applied");
    expect(project.parameters[0]?.name).toBe("Face X");
    expect(project.physicsGroups[0]?.name).toBe("Hair Sway");
    expect(project.parameterBindings).toHaveLength(1);
    expect(project.parameterBindings?.[0]?.target).toEqual({
      type: "bone",
      boneId: generatedBone?.id,
      property: "x",
    });
  });

  it("refreshes managed parameter and physics metadata on safe re-runs", async () => {
    useEditorStore.setState({
      project: createProject({
        layers: [],
        parameters: [
          {
            id: "param-face-x",
            name: "Face X",
            minValue: -1,
            maxValue: 1,
            defaultValue: 0,
            group: "Face",
            managedTag: "safeAutoSetup:v1:parameter:Face X",
            managedSourceFingerprint: "fingerprint-a",
          },
        ],
        physicsGroups: [
          createPhysicsGroup({
            id: "physics-hair",
            name: "Hair Sway",
            gravityStrength: 0.5,
            pendulums: [{ length: 1, mass: 1, damping: 0.4 }],
            managedTag: "safeAutoSetup:v1:physics:hair",
            managedSourceFingerprint: "fingerprint-a",
          }),
        ],
      }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [],
          parameters: [
            {
              id: "param-face-x",
              name: "Face X",
              minValue: -1,
              maxValue: 1,
              defaultValue: 0,
              group: "Face",
            },
          ],
        },
        physicsGroups: [
          {
            name: "Hair Sway",
            partCategory: "hair",
            layerIds: [],
            stiffness: 0.3,
            gravity: 0.5,
            damping: 0.4,
          },
        ],
        plan: {
          planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
          profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
          sourceFingerprint: "fingerprint-a",
          operations: [],
          diagnostics: [],
        },
      }),
    });

    const project = useEditorStore.getState().project!;
    expect(result.status).toBe("applied");
    expect(project.parameters[0]?.managedSignature).toBeTruthy();
    expect(project.physicsGroups[0]?.managedSignature).toBeTruthy();
    expect(project.physicsGroups[0]?.managedSourceFingerprint).toBe(
      "fingerprint-a",
    );
  });

  it("reports unsupported plans without mutating the project", async () => {
    useEditorStore.setState({
      project: createProject({ layers: [] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [],
          parameters: [
            {
              name: "artMesh parameter",
              minValue: -1,
              maxValue: 1,
              defaultValue: 0,
              group: "Test",
            },
          ],
        },
      }),
    });

    expect(result.status).toBe("planUnsupported");
    expect(useEditorStore.getState().project?.parameters).toEqual([]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("reports unsupported hosts when audit hashing is unavailable", async () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    const project = createProject({ layers: [mesh] });
    useEditorStore.setState({ project });
    vi.stubGlobal("crypto", { subtle: undefined });

    const result = await applyAutoSetupResult({
      result: createResult({
        layerGraph: createLayerGraphFromProject(project),
        meshResults: [
          {
            layerId: mesh.id,
            layerName: mesh.name,
            mesh: generateGridMesh(100, 100, 2, 2),
          },
        ],
      }),
    });

    expect(result.status).toBe("unsupportedHost");
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("rolls back and reports unsupported plans when public profile validation fails", async () => {
    useEditorStore.setState({
      project: createProject({
        layers: [],
        parameterBindings: [
          {
            id: "binding-private-target",
            parameterId: "param-face-x",
            target: { type: "privateTarget", property: "x" } as never,
            bindingPoints: [{ paramValue: 0, targetValue: 0 }],
          },
        ],
      }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [],
        },
      }),
    });

    expect(result.status).toBe("planUnsupported");
    expect(useEditorStore.getState().project?.layers).toEqual([]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("rejects apply when the reviewed audit hash no longer matches", async () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    const project = createProject({ layers: [mesh] });
    useEditorStore.setState({ project });

    const result = await applyAutoSetupResult({
      result: createResult({
        layerGraph: createLayerGraphFromProject(project),
        auditTrace: {
          sourceAssetId: "source:project",
          layerGraphId: "layerGraph:source:project",
          acceptedNodeIds: [],
          rejectedNodeIds: [],
          qualityGateResults: [],
          providerArtifactIds: [],
          operationTrace: [],
          safePlanHash:
            "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    });

    expect(result.status).toBe("planUnsupported");
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("restores project and history when an apply operation throws", async () => {
    useEditorStore.setState({
      project: createProject({ layers: [] }),
      projectStructureVersion: 7,
    });
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(
        "00000000-0000-4000-8000-000000000001" as ReturnType<
          typeof crypto.randomUUID
        >,
      )
      .mockImplementationOnce(() => {
        throw new Error("random UUID failed");
      });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [],
        },
        physicsGroups: [
          {
            name: "Hair Sway",
            partCategory: "hair",
            layerIds: [],
            stiffness: 0.3,
            gravity: 0.5,
            damping: 0.4,
          },
        ],
      }),
    });

    const project = useEditorStore.getState().project!;
    expect(result.status).toBe("applyFailed");
    expect(project.layers).toEqual([]);
    expect(project.physicsGroups).toEqual([]);
    expect(useEditorStore.getState().projectStructureVersion).toBe(7);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("reports skipped risky flat manual PNG weights", async () => {
    const mesh = createViviMesh({
      id: "manual-png",
      width: 100,
      height: 100,
    });
    const generatedMesh = {
      vertices: [0, 0, 100, 0, 0, 100, 100, 100],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 1, 3, 2],
      divisionsX: 1,
      divisionsY: 1,
    };
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        sourceKind: "manualPng",
        layers: [mesh],
      },
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_body",
              name: "Body",
              parentTempId: null,
              x: 50,
              y: 70,
              partCategory: "body",
            },
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: "bone_body",
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [],
        },
        meshResults: [
          {
            layerId: mesh.id,
            layerName: mesh.name,
            mesh: generatedMesh,
          },
        ],
        weightResults: [
          {
            layerId: mesh.id,
            boneIds: ["bone_body", "bone_head"],
            weights: [
              [{ boneId: "bone_head", weight: 1 }],
              [{ boneId: "bone_head", weight: 1 }],
              [
                { boneId: "bone_head", weight: 0.35 },
                { boneId: "bone_body", weight: 0.65 },
              ],
              [
                { boneId: "bone_head", weight: 0.35 },
                { boneId: "bone_body", weight: 0.65 },
              ],
            ],
          },
        ],
      }),
    });

    expect(result.status).toBe("applied");
    expect(result.skippedRiskyWeightLayerIds).toEqual([mesh.id]);
    expect(useEditorStore.getState().project?.skins[mesh.id]).toBeUndefined();
  });

  it("skips managed meshes that were user-modified after a matching source run", async () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      managedTag: "safeAutoSetup:v1:mesh:mesh-a",
      managedSourceFingerprint: "fingerprint-a",
    });
    const generatedMesh = generateGridMesh(100, 100, 2, 2);
    generatedMesh.vertices[0] = 12;
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        meshResults: [
          {
            layerId: mesh.id,
            layerName: mesh.name,
            mesh: generatedMesh,
          },
        ],
        plan: {
          planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
          profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
          sourceFingerprint: "fingerprint-a",
          operations: [],
          diagnostics: [],
        },
      }),
    });

    const applied = findLayerById(
      useEditorStore.getState().project!.layers,
      mesh.id,
    );
    expect(result.status).toBe("applied");
    expect(result.skippedManagedObjects).toEqual([
      "userModified:safeAutoSetup:v1:mesh:mesh-a",
    ]);
    if (!applied || !isViviMesh(applied)) {
      throw new Error("Expected managed mesh to remain a ViviMesh.");
    }
    expect(applied.mesh.vertices[0]).toBe(mesh.mesh.vertices[0]);
  });

  it("keeps user-modified managed bones usable for dependent bindings", async () => {
    const existingBone = createBoneNode({
      id: "bone-existing",
      name: "Head",
      x: 51,
      y: 20,
      managedTag: "safeAutoSetup:v1:bone:bone_head",
      managedSourceFingerprint: "fingerprint-a",
    });
    useEditorStore.setState({
      project: createProject({ layers: [existingBone] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [
            {
              name: "Face X",
              minValue: -1,
              maxValue: 1,
              defaultValue: 0,
              group: "Face",
            },
          ],
        },
        plan: {
          planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
          profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
          sourceFingerprint: "fingerprint-a",
          operations: [],
          diagnostics: [],
        },
      }),
    });

    const project = useEditorStore.getState().project!;
    expect(result.status).toBe("applied");
    expect(result.skippedManagedObjects).toEqual([
      "userModified:safeAutoSetup:v1:bone:bone_head",
    ]);
    expect(project.layers.filter((layer) => isBone(layer))).toHaveLength(1);
    expect(project.parameterBindings?.[0]?.target).toEqual({
      type: "bone",
      boneId: existingBone.id,
      property: "x",
    });
  });

  it("does not reuse managed bones from a different source fingerprint", async () => {
    const existingBone = createBoneNode({
      id: "bone-existing",
      name: "Head",
      x: 50,
      y: 20,
      managedTag: "safeAutoSetup:v1:bone:bone_head",
      managedSourceFingerprint: "fingerprint-old",
    });
    useEditorStore.setState({
      project: createProject({ layers: [existingBone] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        boneResult: {
          bones: [
            {
              tempId: "bone_head",
              name: "Head",
              parentTempId: null,
              x: 50,
              y: 20,
              partCategory: "head",
            },
          ],
          parameters: [
            {
              name: "Face X",
              minValue: -1,
              maxValue: 1,
              defaultValue: 0,
              group: "Face",
            },
          ],
        },
        plan: {
          planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
          profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
          sourceFingerprint: "fingerprint-new",
          operations: [],
          diagnostics: [],
        },
      }),
    });

    const project = useEditorStore.getState().project!;
    expect(result.status).toBe("applied");
    expect(result.skippedManagedObjects).toEqual([
      "sourceMismatch:safeAutoSetup:v1:bone:bone_head",
    ]);
    expect(project.parameterBindings).toBeUndefined();
  });

  it("skips managed meshes from a different source fingerprint", async () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      managedTag: "safeAutoSetup:v1:mesh:mesh-a",
      managedSourceFingerprint: "fingerprint-old",
    });
    const generatedMesh = structuredClone(mesh.mesh);
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
    });

    const result = await applyAutoSetupResult({
      result: createResult({
        meshResults: [
          {
            layerId: mesh.id,
            layerName: mesh.name,
            mesh: generatedMesh,
          },
        ],
        plan: {
          planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
          profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
          sourceFingerprint: "fingerprint-new",
          operations: [],
          diagnostics: [],
        },
      }),
    });

    expect(result.status).toBe("applied");
    expect(result.skippedManagedObjects).toEqual([
      "sourceMismatch:safeAutoSetup:v1:mesh:mesh-a",
    ]);
  });
});
