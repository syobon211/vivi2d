import { describe, expect, it } from "vitest";
import { assertManualPngReimportMatchesLayer } from "@vivi2d/editor-core/manual-png-reimport-command";
import {
  assignSequentialDrawOrders,
  buildManualPngImportMetadata,
  buildManualPngImportOptionsFromMetadata,
  buildPreparedLayerEntry,
  computeLayerBounds,
  computeLayerPosition,
  createGroupNode,
  createProjectFromPreparedCanvas,
  createViviMeshFromPreparedCanvas,
  getImageBaseName,
  getNextImportedDrawOrder,
  hasLargeTransparentPadding,
  makeUniqueLayerName,
  type PreparedImageCanvas,
  shouldAutoCenterImportedImage,
} from "../manual-png-import-command";
import { createProject, createViviMesh } from "./fixtures";

const TEST_ASSET_BODY_PNG_PATH = "C:/fixtures/body.png";

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createPreparedCanvas(
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): PreparedImageCanvas {
  return {
    canvas: createCanvas(width, height),
    offsetX,
    offsetY,
    originalWidth: width,
    originalHeight: height,
    trimmed: false,
  };
}

describe("manual-png-import-command", () => {
  it("normalizes imported image base names from file paths", () => {
    expect(getImageBaseName("C:\\images\\Body.png")).toBe("Body");
    expect(getImageBaseName("/tmp/no-extension")).toBe("no-extension");
    expect(getImageBaseName(".png")).toBe("Imported Image");
  });

  it("centers imported canvases when centerOnCanvas is enabled", () => {
    const prepared = createPreparedCanvas(120, 80);

    const position = computeLayerPosition(prepared, 400, 300, {
      centerOnCanvas: true,
      trimTransparentBounds: false,
      createGroupForImportedLayers: false,
      autoGenerateMesh: false,
    });

    expect(position).toEqual({ x: 140, y: 110 });
  });

  it("preserves trimmed offsets when centerOnCanvas is disabled", () => {
    const prepared = createPreparedCanvas(120, 80, 18, 24);

    const position = computeLayerPosition(prepared, 400, 300, {
      centerOnCanvas: false,
      trimTransparentBounds: true,
      createGroupForImportedLayers: false,
      autoGenerateMesh: false,
    });

    expect(position).toEqual({ x: 18, y: 24 });
  });

  it("detects when a large imported image should be auto-centered", () => {
    const prepared = createPreparedCanvas(320, 240);
    prepared.originalWidth = 4063;
    prepared.originalHeight = 7192;

    expect(shouldAutoCenterImportedImage(64, 64, prepared)).toBe(true);
    expect(shouldAutoCenterImportedImage(5000, 8000, prepared)).toBe(false);
  });

  it("detects large transparent padding around imported content", () => {
    const prepared: PreparedImageCanvas = {
      canvas: createCanvas(512, 512),
      offsetX: 600,
      offsetY: 900,
      originalWidth: 4063,
      originalHeight: 7192,
      trimmed: true,
    };

    expect(hasLargeTransparentPadding(prepared)).toBe(true);
    expect(hasLargeTransparentPadding(createPreparedCanvas(100, 80))).toBe(false);
  });

  it("computes merged bounds across imported layers", () => {
    expect(
      computeLayerBounds([
        { x: 20, y: 10, width: 100, height: 60 },
        { x: -40, y: 80, width: 30, height: 20 },
      ]),
    ).toEqual({ x: -40, y: 10, width: 160, height: 90 });
  });

  it("creates manual PNG metadata and restores stable import options from it", () => {
    const prepared = createPreparedCanvas(160, 90, 12, 20);
    const metadata = buildManualPngImportMetadata(
      "body.png",
      prepared,
      { x: 100, y: 140 },
      {
        centerOnCanvas: true,
        trimTransparentBounds: true,
        createGroupForImportedLayers: false,
        autoGenerateMesh: true,
      },
      TEST_ASSET_BODY_PNG_PATH,
    );

    expect(metadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourceFileName: "body.png",
        sourcePath: TEST_ASSET_BODY_PNG_PATH,
        finalOrigin: [100, 140],
        placementMode: "centerOnCanvas",
        trimTransparentBoundsApplied: true,
        autoGenerateMeshApplied: true,
      },
    });

    expect(buildManualPngImportOptionsFromMetadata(metadata.manualPng!)).toEqual({
      centerOnCanvas: true,
      trimTransparentBounds: true,
      createGroupForImportedLayers: false,
      autoGenerateMesh: true,
    });
  });

  it("builds a single-layer project that keeps original canvas size", () => {
    const prepared: PreparedImageCanvas = {
      canvas: createCanvas(128, 96),
      offsetX: 10,
      offsetY: 12,
      originalWidth: 256,
      originalHeight: 192,
      trimmed: true,
    };

    const project = createProjectFromPreparedCanvas("Head.png", prepared, {
      centerOnCanvas: false,
      trimTransparentBounds: true,
      createGroupForImportedLayers: false,
      autoGenerateMesh: false,
    });

    expect(project.name).toBe("Head");
    expect(project.width).toBe(256);
    expect(project.height).toBe(192);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0]).toMatchObject({
      kind: "viviMesh",
      name: "Head",
      width: 128,
      height: 96,
      x: 10,
      y: 12,
    });
  });

  it("creates mesh layers with an injected auto mesh factory and grid fallback", () => {
    const prepared = createPreparedCanvas(64, 32);
    let factoryCalls = 0;
    const layer = createViviMeshFromPreparedCanvas(
      "layer",
      "Layer",
      prepared,
      10,
      { x: 1, y: 2 },
      {
        centerOnCanvas: false,
        trimTransparentBounds: false,
        createGroupForImportedLayers: false,
        autoGenerateMesh: true,
      },
      undefined,
      () => {
        factoryCalls += 1;
        return {
          vertices: [0, 0, 64, 0, 64, 32],
          uvs: [0, 0, 1, 0, 1, 1],
          indices: [0, 1, 2],
          divisionsX: 7,
          divisionsY: 8,
        };
      },
    );
    const fallback = createViviMeshFromPreparedCanvas(
      "fallback",
      "Fallback",
      prepared,
      10,
      { x: 1, y: 2 },
      {
        centerOnCanvas: false,
        trimTransparentBounds: false,
        createGroupForImportedLayers: false,
        autoGenerateMesh: true,
      },
      undefined,
      () => null,
    );

    expect(factoryCalls).toBe(1);
    expect(layer.mesh.divisionsX).toBe(7);
    expect(fallback.mesh.indices.length).toBeGreaterThan(0);
  });

  it("builds prepared layer entries and group bounds", () => {
    const project = createProject({
      width: 400,
      height: 300,
      layers: [createViviMesh({ id: "existing", name: "Head", drawOrder: 3 })],
    });
    const prepared = createPreparedCanvas(80, 40, 5, 6);
    const entry = buildPreparedLayerEntry(
      project,
      "Head.png",
      prepared,
      4,
      {
        centerOnCanvas: false,
        trimTransparentBounds: true,
        createGroupForImportedLayers: false,
        autoGenerateMesh: false,
      },
      "C:/source/Head.png",
    );
    const group = createGroupNode("group", "Imported", [entry.layer], 5);

    expect(entry.layer).toMatchObject({
      name: "Head (2)",
      x: 5,
      y: 6,
      drawOrder: 4,
    });
    expect(group).toMatchObject({ width: 85, height: 46, drawOrder: 5 });
    expect(getNextImportedDrawOrder(project)).toBe(4);
  });

  it("generates unique layer names and renormalizes draw order sequentially", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "base", name: "Base", drawOrder: 0 })],
    });
    project.layers.push({
      ...project.layers[0]!,
      id: "dup-1",
      name: "Hair",
      drawOrder: 0,
    });
    project.layers.push({
      ...project.layers[0]!,
      id: "dup-2",
      name: "Hair (2)",
      drawOrder: 999999,
    });

    expect(makeUniqueLayerName(project, "Hair")).toBe("Hair (3)");

    assignSequentialDrawOrders(project);
    const drawOrders = project.layers.map((layer) => layer.drawOrder ?? 0);
    expect(drawOrders[0]).toBe(0);
    expect(drawOrders[0]).toBeLessThan(drawOrders[1]!);
    expect(drawOrders[1]).toBeLessThan(drawOrders[2]!);
    expect(Math.max(...drawOrders)).toBeLessThanOrEqual(1000);
  });

  it("rejects reimports when bounds no longer match the layer geometry", () => {
    const prepared = createPreparedCanvas(100, 80, 0, 0);
    const metadata = buildManualPngImportMetadata(
      "arm.png",
      prepared,
      { x: 40, y: 60 },
      {
        centerOnCanvas: false,
        trimTransparentBounds: false,
        createGroupForImportedLayers: false,
        autoGenerateMesh: false,
      },
    ).manualPng!;
    const project = createProjectFromPreparedCanvas("arm.png", prepared, {
      centerOnCanvas: false,
      trimTransparentBounds: false,
      createGroupForImportedLayers: false,
      autoGenerateMesh: false,
    });
    const layer = project.layers[0]!;
    if (layer.kind !== "viviMesh") {
      throw new Error("Expected ViviMesh");
    }

    expect(() =>
      assertManualPngReimportMatchesLayer(
        layer,
        {
          offsetX: prepared.offsetX,
          offsetY: prepared.offsetY,
          width: 120,
          height: 80,
        },
        { x: 40, y: 60 },
        metadata,
        "mismatch",
      ),
    ).toThrow("mismatch");
  });
});
