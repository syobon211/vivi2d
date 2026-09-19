import { MAX_PSD_LAYER_PIXELS } from "@vivi2d/core/load-limits";
import type { GroupNode, ViviMeshNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  applyPsdReimportLeaves,
  type PsdReimportLeafInput,
  type PsdReimportTextureSize,
  planPsdReimport,
} from "../psd-reimport-command";
import { createProject, createViviMesh } from "./fixtures";

function createLeaf(overrides: Partial<PsdReimportLeafInput> = {}): PsdReimportLeafInput {
  return {
    token: null,
    displayName: "Body",
    left: 10,
    top: 20,
    width: 100,
    height: 100,
    hasPixels: true,
    ...overrides,
  };
}

function createGroup(overrides: Partial<GroupNode> = {}): GroupNode {
  return {
    id: "group",
    name: "Group",
    kind: "group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    blendMode: "normal",
    expanded: true,
    children: [],
    ...overrides,
  };
}

function createSeeThroughMesh(
  id = "face",
  name = "Face",
  token: string | undefined = "old-token",
): ViviMeshNode {
  return createViviMesh({
    id,
    name,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: "face",
        order: 1,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [3, 4, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
        ...(token ? { psdLeafToken: token } : {}),
      },
    },
  });
}

function textureSizes(...ids: string[]): Map<string, PsdReimportTextureSize> {
  return new Map(ids.map((id) => [id, { width: 100, height: 100 }]));
}

describe("editor-core update-only PSD reimport", () => {
  it("previews actual raster sizes, held entries, unmatched artwork, and retained absent layers", () => {
    const project = createProject({
      layers: ["Body", "Hair", "Face", "Absent"].map((name) =>
        createViviMesh({ id: name, name }),
      ),
    });
    const leaves = [
      createLeaf(),
      createLeaf({ displayName: "Hair", width: 200, height: 200, left: 700, top: -40 }),
      createLeaf({ displayName: "Face", width: 200, height: 150 }),
      createLeaf({ displayName: "New artwork" }),
    ];
    const before = structuredClone(project);
    const plan = planPsdReimport(
      project,
      leaves,
      textureSizes("Body", "Hair", "Face", "Absent"),
    );

    expect(plan.entries.map((entry) => entry.status)).toEqual([
      "eligible",
      "needs-confirmation",
      "held",
      "unmatched",
    ]);
    expect(plan.entries[1]).toMatchObject({
      oldWidth: 100,
      oldHeight: 100,
      newWidth: 200,
      newHeight: 200,
      sourceLeft: 700,
      sourceTop: -40,
    });
    expect(plan.entries[2]?.reason).toBe("aspect-ratio-change");
    expect(plan.removed).toEqual([{ nodeId: "Absent", nodeName: "Absent" }]);
    const result = applyPsdReimportLeaves(project, leaves, plan, [0, 1], [1]);
    expect(result.updatedTextureTargets).toEqual([
      { layerId: "Body", leafIndex: 0 },
      { layerId: "Hair", leafIndex: 1 },
    ]);
    expect(result.metadataChangedLayerIds).toEqual([]);
    expect(project).toEqual(before);
  });

  it("retains custom topology, UVs, bounds, hierarchy, appearance, and manual PNG metadata", () => {
    const body = createViviMesh({
      id: "body",
      name: "Body",
      x: -17,
      y: 29,
      width: 100,
      height: 100,
      visible: false,
      opacity: 0.37,
      blendMode: "multiply",
      drawOrder: 23,
      clipMaskIds: ["mask"],
      multiplyColor: { r: 0.1, g: 0.2, b: 0.3 },
      mesh: {
        vertices: [2, 4, 71, -3, 104, 96],
        uvs: [-0.1, 0.05, 0.7, 0.01, 1.2, 0.95],
        indices: [2, 0, 1],
        divisionsX: 12,
        divisionsY: 9,
      },
      importMetadata: {
        source: "manualPng",
        manualPng: {
          sourceFileName: "Body.png",
          originalWidth: 100,
          originalHeight: 100,
          trimmedBounds: [0, 0, 100, 100],
          finalOrigin: [-17, 29],
          placementMode: "preserveImageOffset",
          autoGenerateMeshApplied: true,
        },
      },
    });
    const project = createProject({ layers: [createGroup({ children: [body] })] });
    const before = structuredClone(project);
    const meshIdentity = body.mesh;
    const leaves = [
      createLeaf({
        width: 200,
        height: 200,
        left: 900,
        top: -300,
        token: "fixture-must-not-replace-manual-metadata",
      }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("body"));

    applyPsdReimportLeaves(project, leaves, plan, [0], [0]);

    expect(project).toEqual(before);
    expect(body.mesh).toBe(meshIdentity);
    const second = planPsdReimport(
      project,
      leaves,
      new Map([["body", { width: 200, height: 200 }]]),
    );
    expect(second.entries[0]?.status).toBe("eligible");
    applyPsdReimportLeaves(project, leaves, second, [0], []);
    expect(project).toEqual(before);
  });

  it("prefers a unique token over a competing name and preserves both layers", () => {
    const tokenOwner = createSeeThroughMesh("token-owner", "Renamed model");
    const nameOwner = createViviMesh({ id: "name-owner", name: "Body" });
    const project = createProject({ layers: [tokenOwner, nameOwner] });
    const before = structuredClone(project);
    const leaves = [createLeaf({ token: "old-token" })];
    const plan = planPsdReimport(
      project,
      leaves,
      textureSizes("token-owner", "name-owner"),
    );

    expect(plan.entries[0]).toMatchObject({
      nodeId: "token-owner",
      matchedBy: "token",
      status: "eligible",
    });
    expect(
      applyPsdReimportLeaves(project, leaves, plan, [0], []).metadataChangedLayerIds,
    ).toEqual([]);
    expect(project).toEqual(before);
  });

  it("holds every many-to-one token/name association even if only one is selected", () => {
    const project = createProject({ layers: [createSeeThroughMesh()] });
    const leaves = [
      createLeaf({ token: "old-token", displayName: "Renamed source" }),
      createLeaf({ displayName: "Face" }),
    ];
    const before = structuredClone(project);
    const plan = planPsdReimport(project, leaves, textureSizes("face"));
    expect(
      plan.entries.map((entry) => [entry.nodeId, entry.status, entry.reason]),
    ).toEqual([
      ["face", "held", "target-conflict"],
      ["face", "held", "target-conflict"],
    ]);
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0], [])).toThrow(
      "selection is invalid",
    );
    expect(project).toEqual(before);
  });

  it("counts missing-pixel source records in duplicate-name preflight", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "body", name: "Body" })],
    });
    const leaves = [createLeaf(), createLeaf({ hasPixels: false })];
    const plan = planPsdReimport(project, leaves, textureSizes("body"));
    expect(plan.entries.map((entry) => entry.reason)).toEqual([
      "incoming-name-ambiguous",
      "incoming-name-ambiguous",
    ]);
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0], [])).toThrow();
  });

  it("includes groups in existing-name ambiguity and never picks the drawable by traversal order", () => {
    const body = createViviMesh({ id: "body", name: "Body" });
    for (const layers of [
      [createGroup({ name: "Body" }), body],
      [body, createGroup({ name: "Body" })],
    ]) {
      const project = createProject({ layers });
      const plan = planPsdReimport(project, [createLeaf()], textureSizes("body"));
      expect(plan.entries[0]).toMatchObject({
        status: "held",
        reason: "existing-name-ambiguous",
      });
    }
  });

  it("uses normalized display names for all existing nodes without renaming their preview labels", () => {
    const body = createViviMesh({ id: "body", name: "v2d[legacy] Body" });
    const project = createProject({ layers: [body] });
    const leaves = [createLeaf()];
    const plan = planPsdReimport(project, leaves, textureSizes("body"));
    expect(plan.entries[0]).toMatchObject({
      nodeId: "body",
      nodeName: "v2d[legacy] Body",
      status: "eligible",
      matchedBy: "name",
    });
    applyPsdReimportLeaves(project, leaves, plan, [0], []);
    expect(body.name).toBe("v2d[legacy] Body");

    project.layers.push(createGroup({ name: "v2d[group] Body" }));
    const ambiguous = planPsdReimport(project, leaves, textureSizes("body"));
    expect(ambiguous.entries[0]?.reason).toBe("existing-name-ambiguous");
  });

  it("holds an identified non-mesh token owner without rematching its competing drawable name", () => {
    const source = createSeeThroughMesh();
    const project = createProject({
      layers: [
        createGroup({ importMetadata: source.importMetadata }),
        createViviMesh({ id: "body", name: "Body" }),
      ],
    });
    const plan = planPsdReimport(
      project,
      [createLeaf({ token: "old-token" })],
      textureSizes("body"),
    );
    expect(plan.entries[0]).toMatchObject({
      nodeId: "group",
      matchedBy: "token",
      status: "held",
      reason: "unsupported-target",
    });
  });

  it("allows duplicated-token unique-name fallback without assigning duplicate tokens", () => {
    const a = createSeeThroughMesh("a", "A");
    const b = createSeeThroughMesh("b", "B");
    const project = createProject({ layers: [a, b] });
    const before = structuredClone(project);
    const leaves = [
      createLeaf({ token: "duplicated", displayName: "A" }),
      createLeaf({ token: "duplicated", displayName: "B" }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("a", "b"));
    expect(
      plan.entries.map((entry) => [entry.status, entry.matchedBy, entry.nextToken]),
    ).toEqual([
      ["eligible", "name", undefined],
      ["eligible", "name", undefined],
    ]);
    applyPsdReimportLeaves(project, leaves, plan, [0, 1], []);
    expect(project).toEqual(before);
  });

  it("does not assign a name-fallback token already held by other existing nodes", () => {
    const a = createSeeThroughMesh("a", "A", "claimed");
    const b = createSeeThroughMesh("b", "B", "claimed");
    const target = createSeeThroughMesh("target", "Body", "original");
    const project = createProject({ layers: [a, b, target] });
    const before = structuredClone(project);
    const leaves = [createLeaf({ token: "claimed" })];
    const plan = planPsdReimport(project, leaves, textureSizes("target"));
    expect(plan.entries[0]).toMatchObject({
      nodeId: "target",
      matchedBy: "name",
      status: "eligible",
    });
    expect(plan.entries[0]?.nextToken).toBeUndefined();
    applyPsdReimportLeaves(project, leaves, plan, [0], []);
    expect(project).toEqual(before);
  });

  it("holds unresolved duplicate tokens instead of adding new layers", () => {
    const project = createProject();
    const leaves = [
      createLeaf({ token: "duplicate", displayName: "A" }),
      createLeaf({ token: "duplicate", displayName: "B" }),
    ];
    const plan = planPsdReimport(project, leaves, new Map());
    expect(plan.entries.map((entry) => entry.reason)).toEqual([
      "token-ambiguous",
      "token-ambiguous",
    ]);
    expect(
      applyPsdReimportLeaves(project, leaves, plan, [], []).updatedTextureTargets,
    ).toEqual([]);
    expect(project.layers).toEqual([]);
  });

  it.each([
    undefined,
    "old-token",
  ])("backfills/rebinds only a selected SeeThrough token (%s)", (oldToken) => {
    const a = createSeeThroughMesh("a", "A", oldToken);
    if (oldToken === undefined && a.importMetadata?.source === "seeThrough") {
      delete a.importMetadata.seeThrough.psdLeafToken;
    }
    const b = createSeeThroughMesh("b", "B", "keep");
    const project = createProject({ layers: [a, b] });
    const expected = structuredClone(project);
    const expectedA = expected.layers[0]!;
    if (expectedA.importMetadata?.source === "seeThrough") {
      expectedA.importMetadata.seeThrough.psdLeafToken = "new-a";
    }
    const leaves = [
      createLeaf({ token: "new-a", displayName: "A" }),
      createLeaf({ token: "new-b", displayName: "B" }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("a", "b"));
    const result = applyPsdReimportLeaves(project, leaves, plan, [0], []);
    expect(result.metadataChangedLayerIds).toEqual(["a"]);
    expect(result.updatedTextureTargets).toEqual([{ layerId: "a", leafIndex: 0 }]);
    expect(project).toEqual(expected);
  });

  it.each([
    ["missing-pixels", false, textureSizes("body")],
    ["missing-texture", true, new Map<string, PsdReimportTextureSize>()],
  ] as const)("holds known targets with %s", (reason, hasPixels, sizes) => {
    const project = createProject({
      layers: [createViviMesh({ id: "body", name: "Body" })],
    });
    const plan = planPsdReimport(project, [createLeaf({ hasPixels })], sizes);
    expect(plan.entries[0]).toMatchObject({ nodeId: "body", status: "held", reason });
  });

  it.each([
    [0, 100],
    [-1, 100],
    [1.5, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [MAX_PSD_LAYER_PIXELS + 1, 1],
    [8193, 8192],
  ])("holds invalid old or incoming dimensions %s x %s", (width, height) => {
    const project = createProject({
      layers: [createViviMesh({ id: "body", name: "Body" })],
    });
    const badIncoming = planPsdReimport(
      project,
      [createLeaf({ width, height })],
      textureSizes("body"),
    );
    const badOld = planPsdReimport(
      project,
      [createLeaf()],
      new Map([["body", { width, height }]]),
    );
    expect(badIncoming.entries[0]?.reason).toBe("invalid-dimensions");
    expect(badOld.entries[0]?.reason).toBe("invalid-dimensions");
  });

  it("accepts the exact per-layer pixel ceiling and rejects near-aspect equality", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "body", name: "Body" })],
    });
    const sizes = new Map([["body", { width: 8192, height: 8192 }]]);
    const downsample = planPsdReimport(
      project,
      [createLeaf({ width: 4096, height: 4096 })],
      sizes,
    );
    const near = planPsdReimport(
      project,
      [createLeaf({ width: 4096, height: 4095 })],
      sizes,
    );
    expect(downsample.entries[0]?.status).toBe("needs-confirmation");
    expect(near.entries[0]?.reason).toBe("aspect-ratio-change");
  });

  it("requires the exact selected resolution-change set to be confirmed", () => {
    const project = createProject({
      layers: [createSeeThroughMesh("a", "A"), createSeeThroughMesh("b", "B")],
    });
    const before = structuredClone(project);
    const leaves = [
      createLeaf({ displayName: "A", token: "new-a", width: 200, height: 200 }),
      createLeaf({ displayName: "B", token: "new-b", width: 200, height: 200 }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("a", "b"));
    for (const [selected, confirmed] of [
      [[0], []],
      [[0, 1], [0]],
      [[0], [0, 1]],
      [[0], [0, 0]],
    ]) {
      expect(() =>
        applyPsdReimportLeaves(project, leaves, plan, selected!, confirmed!),
      ).toThrow();
      expect(project).toEqual(before);
    }
    expect(
      applyPsdReimportLeaves(project, leaves, plan, [], []).updatedTextureTargets,
    ).toEqual([]);
    expect(project).toEqual(before);
  });

  it.each([
    [0, 0],
    [0, 8],
    [0, -1],
    [0, 0.5],
    [0, Number.NaN],
  ])("rejects invalid selections before even an earlier valid token update", (...selected) => {
    const project = createProject({ layers: [createSeeThroughMesh("face", "Body")] });
    const before = structuredClone(project);
    const leaves = [createLeaf({ token: "new-token" })];
    const plan = planPsdReimport(project, leaves, textureSizes("face"));
    expect(() => applyPsdReimportLeaves(project, leaves, plan, selected, [])).toThrow();
    expect(project).toEqual(before);
  });

  it("rejects held/unmatched entries and confirmations for same-size entries without partial mutation", () => {
    const project = createProject({
      layers: [
        createSeeThroughMesh("face", "Body"),
        createViviMesh({ id: "hair", name: "Hair" }),
      ],
    });
    const before = structuredClone(project);
    const leaves = [
      createLeaf({ token: "new-token" }),
      createLeaf({ displayName: "Hair", width: 200, height: 100 }),
      createLeaf({ displayName: "Unmatched" }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("face", "hair"));
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0, 1], [])).toThrow();
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0, 2], [])).toThrow();
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0], [0])).toThrow();
    expect(project).toEqual(before);
  });

  it("rejects changed selected source inputs and current target associations", () => {
    const project = createProject({ layers: [createSeeThroughMesh("face", "Body")] });
    const leaves = [createLeaf({ token: "new-token" })];
    const plan = planPsdReimport(project, leaves, textureSizes("face"));
    const changedProject = structuredClone(project);
    changedProject.layers[0]!.name = "Changed";
    expect(() => applyPsdReimportLeaves(changedProject, leaves, plan, [0], [])).toThrow(
      "stale",
    );
    expect(() =>
      applyPsdReimportLeaves(project, [createLeaf({ width: 200 })], plan, [0], []),
    ).toThrow("stale");
    expect(() =>
      applyPsdReimportLeaves(project, [createLeaf({ hasPixels: false })], plan, [0], []),
    ).toThrow("stale");
    expect(project.layers[0]?.importMetadata?.seeThrough?.psdLeafToken).toBe("old-token");
  });

  it("validates every selected token precondition before changing earlier metadata", () => {
    const project = createProject({
      layers: [createSeeThroughMesh("a", "A"), createSeeThroughMesh("b", "B")],
    });
    const leaves = [
      createLeaf({ displayName: "A", token: "new-a" }),
      createLeaf({ displayName: "B", token: "new-b" }),
    ];
    const plan = planPsdReimport(project, leaves, textureSizes("a", "b"));
    project.layers.push(createSeeThroughMesh("owner", "Owner", "new-b"));
    const before = structuredClone(project);
    expect(() => applyPsdReimportLeaves(project, leaves, plan, [0, 1], [])).toThrow(
      "stale",
    );
    expect(project).toEqual(before);
  });
});
