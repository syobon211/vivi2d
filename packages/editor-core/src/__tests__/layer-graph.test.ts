import { describe, expect, it } from "vitest";
import type { SafeAutoSetupPlan } from "../safe-auto-setup-plan";
import {
  SAFE_AUTO_SETUP_PLAN_PROFILE,
  SAFE_AUTO_SETUP_PLAN_VERSION,
} from "../safe-auto-setup-plan";
import {
  createLayerGraphFromProject,
  validateLayerGraph,
  type LayerGraph,
} from "../layer-graph";
import {
  compileLayerGraphSafeAutoSetupPlan,
  createSafePlanHash,
} from "../layer-graph-safe-plan";
import type { ProjectData } from "@vivi2d/core/types";

function createProject(): ProjectData {
  return {
    version: 10,
    width: 512,
    height: 512,
    sourceKind: "psd",
    parameters: [],
    physicsGroups: [],
    colliders: [],
    expressionPresets: [],
    scenes: [],
    stateMachines: [],
    skins: {},
    layers: [
      {
        id: "face",
        name: "face",
        kind: "viviMesh",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        blendMode: "normal",
        expanded: true,
        children: [],
        semanticRole: "face",
        mesh: {
          vertices: [0, 0, 128, 0, 128, 128, 0, 128],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          indices: [0, 1, 2, 0, 2, 3],
          divisionsX: 1,
          divisionsY: 1,
        },
      },
      {
        id: "hair",
        name: "front hair",
        kind: "viviMesh",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        blendMode: "normal",
        expanded: true,
        children: [],
        semanticRole: "hairFront",
        mesh: {
          vertices: [0, 0, 128, 0, 128, 128, 0, 128],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          indices: [0, 1, 2, 0, 2, 3],
          divisionsX: 1,
          divisionsY: 1,
        },
      },
    ],
  };
}

function createPlan(solver: "rigidLayer" | "secondaryMotion" | "bbw"): SafeAutoSetupPlan {
  return {
    planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
    profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
    sourceFingerprint: "sha256:test",
    operations: [
      {
        kind: "createSkin",
        layerId: "hair",
        weights: [[{ boneId: "bone_head", weight: 1 }]],
        boneIds: ["bone_head"],
        solver,
      },
    ],
    diagnostics: [],
  };
}

describe("LayerGraph", () => {
  it("creates a source-preserving graph from project layers", () => {
    const graph = createLayerGraphFromProject(createProject());

    expect(validateLayerGraph(graph).ok).toBe(true);
    expect(graph.nodes.map((node) => node.semantic)).toEqual([
      "face",
      "frontHair",
    ]);
    expect(graph.occlusionEdges).toHaveLength(1);
  });

  it("rejects generated hidden ownership of protected semantics", () => {
    const graph: LayerGraph = createLayerGraphFromProject(createProject());
    graph.nodes[0] = {
      ...graph.nodes[0]!,
      provenance: "generatedHidden",
    };

    const validation = validateLayerGraph(graph);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((d) => d.code)).toContain("unsafeProvenance");
  });

  it("rejects provider proposal ownership of protected semantics", () => {
    const graph: LayerGraph = createLayerGraphFromProject(createProject());
    graph.nodes[0] = {
      ...graph.nodes[0]!,
      provenance: "providerProposal",
    };

    const validation = validateLayerGraph(graph);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((d) => d.code)).toContain("unsafeProvenance");
  });

  it("rejects accepted graphs with not-run gates", () => {
    const graph: LayerGraph = createLayerGraphFromProject(createProject());
    graph.quality.gateResults[0] = {
      ...graph.quality.gateResults[0]!,
      status: "notRun",
    };
    graph.quality.accepted = true;

    const validation = validateLayerGraph(graph);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((d) => d.path)).toContain("quality.accepted");
  });

  it("rejects nodes without source layers", () => {
    const graph: LayerGraph = createLayerGraphFromProject(createProject());
    graph.nodes[0] = {
      ...graph.nodes[0]!,
      sourceLayerIds: [],
    };

    const validation = validateLayerGraph(graph);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((d) => d.path)).toContain(
      "nodes[0].sourceLayerIds",
    );
  });

  it("blocks plans when the LayerGraph is not accepted", async () => {
    const graph: LayerGraph = createLayerGraphFromProject(createProject());
    graph.quality = {
      ...graph.quality,
      accepted: false,
    };

    await expect(
      compileLayerGraphSafeAutoSetupPlan({
        layerGraph: graph,
        plan: createPlan("rigidLayer"),
      }),
    ).rejects.toThrow(/quality gates/i);
  });

  it("compiles an audit trace and blocks bbw before the review gate", async () => {
    const graph = createLayerGraphFromProject(createProject());

    await expect(
      compileLayerGraphSafeAutoSetupPlan({
        layerGraph: graph,
        plan: createPlan("bbw"),
      }),
    ).rejects.toThrow(/BBW review gate/i);

    const compiled = await compileLayerGraphSafeAutoSetupPlan({
      layerGraph: graph,
      plan: createPlan("secondaryMotion"),
    });
    expect(compiled.auditTrace.acceptedNodeIds).toEqual([
      "node:face",
      "node:hair",
    ]);
    expect(compiled.auditTrace.safePlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps audit trace source nodes for layer and controller operations", async () => {
    const graph = createLayerGraphFromProject(createProject());
    const plan: SafeAutoSetupPlan = {
      ...createPlan("rigidLayer"),
      operations: [
        ...createPlan("rigidLayer").operations,
        {
          kind: "createBinding",
          parameterId: "vivi.head.yaw",
          target: { type: "bone", tempBoneId: "bone_head", property: "angle" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
      ],
    };

    const compiled = await compileLayerGraphSafeAutoSetupPlan({
      layerGraph: graph,
      plan,
    });

    expect(compiled.auditTrace.operationTrace[0]?.sourceNodeIds).toEqual([
      "node:hair",
    ]);
    expect(compiled.auditTrace.operationTrace[1]?.sourceNodeIds).toEqual([
      "node:face",
      "node:hair",
    ]);
  });

  it("excludes user-skipped source layers from broad audit traces", async () => {
    const graph = createLayerGraphFromProject(createProject());
    const plan: SafeAutoSetupPlan = {
      ...createPlan("rigidLayer"),
      operations: [
        {
          kind: "createBinding",
          parameterId: "vivi.head.yaw",
          target: { type: "bone", tempBoneId: "bone_head", property: "angle" },
          bindingPoints: [{ paramValue: 0, targetValue: 0 }],
        },
      ],
    };

    const compiled = await compileLayerGraphSafeAutoSetupPlan(
      {
        layerGraph: graph,
        plan,
      },
      { excludedSourceLayerIds: ["face"] },
    );

    expect(compiled.auditTrace.acceptedNodeIds).toEqual(["node:hair"]);
    expect(compiled.auditTrace.rejectedNodeIds).toEqual(["node:face"]);
    expect(compiled.auditTrace.operationTrace[0]?.sourceNodeIds).toEqual([
      "node:hair",
    ]);
  });

  it("keeps rejected low-confidence nodes out of operation traces", async () => {
    const graph = createLayerGraphFromProject(createProject());
    graph.nodes = graph.nodes.map((node) =>
      node.id === "node:hair" ? { ...node, confidence: 0.45 } : node,
    );

    const compiled = await compileLayerGraphSafeAutoSetupPlan({
      layerGraph: graph,
      plan: createPlan("rigidLayer"),
    });

    expect(compiled.auditTrace.acceptedNodeIds).toEqual(["node:face"]);
    expect(compiled.auditTrace.rejectedNodeIds).toEqual(["node:hair"]);
    expect(compiled.auditTrace.operationTrace[0]?.sourceNodeIds).toEqual([]);
  });

  it("uses diagnostics in the reviewed plan hash", async () => {
    const base = createPlan("rigidLayer");
    const changed: SafeAutoSetupPlan = {
      ...base,
      diagnostics: [
        {
          severity: "warning",
          code: "unsupportedOperation",
          message: "review note",
        },
      ],
    };
    await expect(createSafePlanHash(base)).resolves.not.toBe(
      await createSafePlanHash(changed),
    );
  });

  it("allows canonical diagnostic paths but rejects host-local paths", async () => {
    const plan = createPlan("rigidLayer");
    plan.diagnostics = [
      {
        severity: "warning",
        code: "unsupportedOperation",
        message: "review note",
        path: "operations[0]",
      },
    ];
    await expect(createSafePlanHash(plan)).resolves.toMatch(/^sha256:/);

    await expect(
      createSafePlanHash({
        ...plan,
        diagnostics: [
          {
            severity: "warning",
            code: "unsupportedOperation",
            message: "review note",
            path: "C:/Users/example/source.png",
          },
        ],
      }),
    ).rejects.toThrow(/host path/);

    await expect(
      createSafePlanHash({
        ...plan,
        operations: [
          {
            ...plan.operations[0]!,
            path: "C:/Users/example/source.png",
          } as never,
        ],
      }),
    ).rejects.toThrow(/cannot include/);
  });

  it("preserves undefined array entries in canonical audit hashes", async () => {
    const base = createPlan("rigidLayer");
    const sparse = {
      ...base,
      diagnostics: [undefined as never],
    };

    await expect(createSafePlanHash(base)).resolves.not.toBe(
      await createSafePlanHash(sparse),
    );
  });

  it("matches JSON omission semantics for undefined object fields", async () => {
    const base = createPlan("rigidLayer");
    const withUndefinedField = {
      ...base,
      diagnostics: [
        {
          severity: "info",
          code: "acceptedLayerGraphNode",
          message: "accepted",
          path: undefined,
        },
      ],
    };
    const withoutUndefinedField = {
      ...base,
      diagnostics: [
        {
          severity: "info",
          code: "acceptedLayerGraphNode",
          message: "accepted",
        },
      ],
    };

    await expect(createSafePlanHash(withUndefinedField)).resolves.toBe(
      await createSafePlanHash(withoutUndefinedField),
    );
  });
});
