import { describe, expect, it } from "vitest";
import type { GroupNode, ViviMeshNode } from "@vivi2d/core/types";
import {
  applyPsdReimportLeaves,
  planPsdReimport,
  type PsdReimportLeafInput,
} from "../psd-reimport-command";
import { createProject, createViviMesh } from "./fixtures";

function createLeaf(
  overrides: Partial<PsdReimportLeafInput> = {},
): PsdReimportLeafInput {
  return {
    token: null,
    displayName: "Body",
    left: 10,
    top: 20,
    width: 120,
    height: 130,
    visible: true,
    opacity: 1,
    blendMode: "normal",
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

function createSeeThroughMesh(overrides: Partial<ViviMeshNode> = {}): ViviMeshNode {
  return createViviMesh({
    id: "see-through",
    name: "Face Clean",
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: "face",
        order: 1,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
        psdLeafToken: "layer_000",
      },
    },
    ...overrides,
  });
}

describe("editor-core PSD reimport command", () => {
  it("plans updates, additions, and removed ViviMeshes from PSD leaves", () => {
    const body = createViviMesh({ id: "body", name: "Body" });
    const stale = createViviMesh({ id: "stale", name: "Stale" });
    const group = createGroup({ id: "group", name: "Group" });
    const project = createProject({ layers: [body, stale, group] });

    const plan = planPsdReimport(project, [
      createLeaf({ displayName: "Body" }),
      createLeaf({ displayName: "Hair" }),
    ]);

    expect(plan.diff).toEqual({
      updated: [{ nodeId: "body", nodeName: "Body" }],
      added: [{ nodeName: "Hair" }],
      removed: [{ nodeId: "stale", nodeName: "Stale" }],
    });
  });

  it("applies matched geometry and reports texture targets without touching app textures", () => {
    const mesh = createViviMesh({
      id: "body",
      name: "Body",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const project = createProject({ layers: [mesh] });

    const result = applyPsdReimportLeaves(project, [createLeaf()], {
      createLayerId: () => "unused",
    });

    expect(result.diff.updated).toEqual([{ nodeId: "body", nodeName: "Body" }]);
    expect(result.updatedTextureTargets).toEqual([{ layerId: "body", leafIndex: 0 }]);
    expect(project.layers[0]).toMatchObject({
      x: 10,
      y: 20,
      width: 120,
      height: 130,
    });
  });

  it("matches unique See-through PSD tokens even when visible names differ", () => {
    const mesh = createSeeThroughMesh({ id: "face", name: "Face Clean" });
    const project = createProject({ layers: [mesh] });

    const result = applyPsdReimportLeaves(
      project,
      [createLeaf({ token: "layer_000", displayName: "Face Updated" })],
      { createLayerId: () => "unused" },
    );

    expect(result.diff.updated).toEqual([{ nodeId: "face", nodeName: "Face Clean" }]);
    expect(project.layers[0]).toMatchObject({ x: 10, y: 20, width: 120, height: 130 });
  });

  it("prefers a unique token match over a competing visible-name match", () => {
    const tokenOwner = createSeeThroughMesh({
      id: "token-owner",
      name: "Old Face",
    });
    const nameOwner = createViviMesh({
      id: "name-owner",
      name: "Incoming Face",
    });
    const project = createProject({ layers: [tokenOwner, nameOwner] });

    const plan = planPsdReimport(project, [
      createLeaf({ token: "layer_000", displayName: "Incoming Face" }),
    ]);

    expect(plan.diff.updated).toEqual([
      { nodeId: "token-owner", nodeName: "Old Face" },
    ]);
    expect(plan.diff.removed).toEqual([
      { nodeId: "name-owner", nodeName: "Incoming Face" },
    ]);
  });

  it("backfills See-through PSD tokens on name fallback when the token is unclaimed", () => {
    const mesh = createSeeThroughMesh({
      id: "face",
      name: "Face Clean",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 1,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [mesh] });

    applyPsdReimportLeaves(
      project,
      [createLeaf({ token: "layer_001", displayName: "Face Clean" })],
      { createLayerId: () => "unused" },
    );

    const updated = project.layers[0] as ViviMeshNode;
    expect(updated.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_001");
  });

  it("does not backfill a token during token matches or duplicate-token fallback", () => {
    const tokenMatch = createSeeThroughMesh({
      id: "token-match",
      name: "Token Match",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 0,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
          psdLeafToken: "owned",
        },
      },
    });
    const duplicateA = createSeeThroughMesh({
      id: "duplicate-a",
      name: "Duplicate A",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 1,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const duplicateB = createSeeThroughMesh({
      id: "duplicate-b",
      name: "Duplicate B",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 2,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [tokenMatch, duplicateA, duplicateB] });

    applyPsdReimportLeaves(
      project,
      [
        createLeaf({ token: "owned", displayName: "Token Match" }),
        createLeaf({ token: "duplicate", displayName: "Duplicate A" }),
        createLeaf({ token: "duplicate", displayName: "Duplicate B" }),
      ],
      { createLayerId: () => "unused" },
    );

    const [updatedTokenMatch, updatedDuplicateA, updatedDuplicateB] =
      project.layers as ViviMeshNode[];
    expect(updatedTokenMatch?.importMetadata?.seeThrough?.psdLeafToken).toBe("owned");
    expect(updatedDuplicateA?.importMetadata?.seeThrough?.psdLeafToken).toBeUndefined();
    expect(updatedDuplicateB?.importMetadata?.seeThrough?.psdLeafToken).toBeUndefined();
  });

  it("omits texture targets for matched PSD leaves without pixels", () => {
    const mesh = createViviMesh({ id: "body", name: "Body" });
    const project = createProject({ layers: [mesh] });

    const result = applyPsdReimportLeaves(
      project,
      [createLeaf({ hasPixels: false })],
      { createLayerId: () => "unused" },
    );

    expect(result.diff.updated).toEqual([{ nodeId: "body", nodeName: "Body" }]);
    expect(result.updatedTextureTargets).toEqual([]);
  });

  it("regenerates matched mesh topology when the current vertex count is incompatible", () => {
    const mesh = createViviMesh({
      id: "body",
      name: "Body",
      mesh: {
        vertices: [0, 0],
        uvs: [],
        indices: [],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    const project = createProject({ layers: [mesh] });

    applyPsdReimportLeaves(project, [createLeaf()], {
      createLayerId: () => "unused",
    });

    const updated = project.layers[0] as ViviMeshNode;
    expect(updated.mesh.vertices.length).toBeGreaterThan(2);
  });

  it("creates added mesh and group layers with deterministic app-provided ids", () => {
    const project = createProject({ layers: [] });
    const result = applyPsdReimportLeaves(
      project,
      [
        createLeaf({ displayName: "Paint", hasPixels: true }),
        createLeaf({ displayName: "Folder", hasPixels: false }),
      ],
      {
        createLayerId: (_leaf, index) => `added-${index}`,
      },
    );

    expect(result.diff.added).toEqual([
      { nodeName: "Paint" },
      { nodeName: "Folder" },
    ]);
    expect(result.addedTextureTargets).toEqual([{ layerId: "added-0", leafIndex: 0 }]);
    expect(project.layers[0]).toMatchObject({
      id: "added-0",
      name: "Paint",
      kind: "viviMesh",
    });
    expect(project.layers[1]).toMatchObject({
      id: "added-1",
      name: "Folder",
      kind: "group",
    });
  });
});
