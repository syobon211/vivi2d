import { describe, expect, it } from "vitest";
import type {
  GroupNode,
  ManualPngImportMetadata,
  ManualPngLayerImportMetadata,
  ViviMeshNode,
} from "@vivi2d/core/types";
import {
  applyManualPngReimportToLayer,
  assertManualPngReimportMatchesLayer,
  getManualPngReimportTargetLayer,
  type ManualPngReimportPreparedBounds,
} from "../manual-png-reimport-command";
import { createProject, createViviMesh } from "./fixtures";

const manualPngImportMetadata: ManualPngLayerImportMetadata = {
  source: "manualPng",
  manualPng: {
    sourceFileName: "character.png",
    sourcePath: "C:/images/character.png",
    originalWidth: 100,
    originalHeight: 100,
    trimmedBounds: [0, 0, 50, 60] as [number, number, number, number],
    finalOrigin: [10, 20] as [number, number],
    placementMode: "preserveImageOffset" as const,
    trimTransparentBoundsApplied: false,
    autoGenerateMeshApplied: false,
  },
};

const matchingPrepared: ManualPngReimportPreparedBounds = {
  offsetX: 0,
  offsetY: 0,
  width: 50,
  height: 60,
};
const matchingPosition = { x: 10, y: 20 };

function createManualPngTarget(
  overrides: Partial<Pick<ViviMeshNode, "id" | "x" | "y" | "width" | "height">> = {},
): ViviMeshNode {
  return createViviMesh({
    id: "target",
    x: matchingPosition.x,
    y: matchingPosition.y,
    width: matchingPrepared.width,
    height: matchingPrepared.height,
    importMetadata: manualPngImportMetadata,
    ...overrides,
  });
}

function createGroup(children: GroupNode["children"] = []): GroupNode {
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
    children,
  };
}

describe("editor-core manual PNG reimport command", () => {
  it("finds only manual PNG ViviMesh reimport targets", () => {
    const project = createProject({
      layers: [
        createViviMesh({
          id: "target",
          importMetadata: manualPngImportMetadata,
        }),
        createViviMesh({ id: "plain" }),
      ],
    });

    expect(getManualPngReimportTargetLayer(project, "target")?.metadata).toEqual(
      manualPngImportMetadata.manualPng,
    );
    expect(getManualPngReimportTargetLayer(project, "plain")).toBeNull();
    expect(getManualPngReimportTargetLayer(project, "missing")).toBeNull();
  });

  it("finds manual PNG targets nested inside groups", () => {
    const nestedLayer = createManualPngTarget({ id: "nested-target" });
    const group = createGroup([nestedLayer]);
    const project = createProject({ layers: [group] });

    expect(getManualPngReimportTargetLayer(project, "nested-target")?.layer.id).toBe(
      "nested-target",
    );
  });

  it("accepts reimport geometry that still matches the original layer", () => {
    const layer = createManualPngTarget();

    expect(() =>
      assertManualPngReimportMatchesLayer(
        layer,
        matchingPrepared,
        matchingPosition,
        manualPngImportMetadata.manualPng,
        "mismatch",
      ),
    ).not.toThrow();
  });

  const mismatchCases: Array<
    [
      string,
      {
        prepared?: Partial<ManualPngReimportPreparedBounds>;
        position?: Partial<typeof matchingPosition>;
        layer?: Partial<Pick<ViviMeshNode, "x" | "y" | "width" | "height">>;
        metadata?: Partial<Pick<ManualPngImportMetadata, "trimmedBounds" | "finalOrigin">>;
      },
    ]
  > = [
    ["prepared offsetX", { prepared: { offsetX: 1 } }],
    ["prepared offsetY", { prepared: { offsetY: 1 } }],
    ["prepared width", { prepared: { width: 55 } }],
    ["prepared height", { prepared: { height: 65 } }],
    ["layer x", { layer: { x: 11 } }],
    ["layer y", { layer: { y: 21 } }],
    ["layer width", { layer: { width: 55 } }],
    ["layer height", { layer: { height: 65 } }],
    ["metadata trimmed offsetX", { metadata: { trimmedBounds: [1, 0, 50, 60] } }],
    ["metadata trimmed offsetY", { metadata: { trimmedBounds: [0, 1, 50, 60] } }],
    ["metadata trimmed width", { metadata: { trimmedBounds: [0, 0, 55, 60] } }],
    ["metadata trimmed height", { metadata: { trimmedBounds: [0, 0, 50, 65] } }],
    ["metadata finalOrigin x", { metadata: { finalOrigin: [11, 20] } }],
    ["metadata finalOrigin y", { metadata: { finalOrigin: [10, 21] } }],
  ];

  it.each(mismatchCases)(
    "rejects reimport geometry when %s no longer matches",
    (_name, overrides) => {
      const layer = createManualPngTarget(overrides.layer);
      const metadata: ManualPngImportMetadata = {
        ...manualPngImportMetadata.manualPng,
        ...overrides.metadata,
      };

      expect(() =>
        assertManualPngReimportMatchesLayer(
          layer,
          { ...matchingPrepared, ...overrides.prepared },
          { ...matchingPosition, ...overrides.position },
          metadata,
          "mismatch",
        ),
      ).toThrow("mismatch");
    },
  );

  it("updates layer geometry and metadata in place", () => {
    const project = createProject({
      layers: [createManualPngTarget()],
    });
    const nextMetadata: ManualPngLayerImportMetadata = {
      ...manualPngImportMetadata,
      manualPng: {
        ...manualPngImportMetadata.manualPng,
        sourceFileName: "updated.png",
      },
    };

    const applied = applyManualPngReimportToLayer(project, {
      layerId: "target",
      geometry: { x: 12, y: 24, width: 50, height: 60 },
      importMetadata: nextMetadata,
    });

    expect(applied).toBe(true);
    expect(project.layers[0]).toMatchObject({
      x: 12,
      y: 24,
      width: 50,
      height: 60,
      importMetadata: nextMetadata,
    });
  });

  it("updates nested layer geometry and metadata in place", () => {
    const nestedLayer = createManualPngTarget({ id: "nested-target" });
    const group = createGroup([nestedLayer]);
    const project = createProject({ layers: [group] });
    const nextMetadata: ManualPngLayerImportMetadata = {
      ...manualPngImportMetadata,
      manualPng: {
        ...manualPngImportMetadata.manualPng,
        sourceFileName: "nested-updated.png",
      },
    };

    const applied = applyManualPngReimportToLayer(project, {
      layerId: "nested-target",
      geometry: { x: 14, y: 28, width: 50, height: 60 },
      importMetadata: nextMetadata,
    });

    expect(applied).toBe(true);
    expect(group.children[0]).toMatchObject({
      x: 14,
      y: 28,
      width: 50,
      height: 60,
      importMetadata: nextMetadata,
    });
  });

  it("returns false when the target layer cannot be updated", () => {
    const group = createGroup();
    const project = createProject({
      layers: [group, createViviMesh({ id: "target" })],
    });

    expect(
      applyManualPngReimportToLayer(project, {
        layerId: "missing",
        geometry: { x: 12, y: 24, width: 50, height: 60 },
        importMetadata: manualPngImportMetadata,
      }),
    ).toBe(false);
    expect(
      applyManualPngReimportToLayer(project, {
        layerId: "group",
        geometry: { x: 12, y: 24, width: 50, height: 60 },
        importMetadata: manualPngImportMetadata,
      }),
    ).toBe(false);
    expect(
      applyManualPngReimportToLayer(project, {
        layerId: "target",
        geometry: { x: 12, y: 24, width: 50, height: 60 },
        importMetadata: manualPngImportMetadata,
      }),
    ).toBe(false);
  });
});
