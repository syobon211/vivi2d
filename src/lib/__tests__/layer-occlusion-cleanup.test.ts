import { describe, expect, it } from "vitest";
import { createViviMesh } from "@/test/fixtures";
import {
  applyLayerOcclusionCleanupPlan,
  applyLayerOcclusionCleanupToTextures,
  buildLayerOcclusionCleanupPreviewReport,
  cleanupLowerLayerImageDataByForegroundMask,
  createLayerOcclusionCleanupPlan,
} from "../layer-occlusion-cleanup";

function makeFilledImageData(
  width: number,
  height: number,
  color: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return new ImageData(data, width, height);
}

function setPixel(
  imageData: ImageData,
  x: number,
  y: number,
  color: [number, number, number, number],
): void {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = color[0];
  imageData.data[index + 1] = color[1];
  imageData.data[index + 2] = color[2];
  imageData.data[index + 3] = color[3];
}

describe("layer occlusion cleanup", () => {
  it("feathers and underpaints high-contrast lower-layer lines under a foreground mask", () => {
    const lower = makeFilledImageData(15, 15, [240, 240, 240, 255]);
    for (let y = 0; y < lower.height; y += 1) {
      setPixel(lower, 7, y, [12, 12, 12, 255]);
    }
    const foreground = makeFilledImageData(5, 5, [80, 220, 80, 255]);

    const result = cleanupLowerLayerImageDataByForegroundMask(
      { x: 0, y: 0, width: 15, height: 15 },
      lower,
      { x: 5, y: 5, width: 5, height: 5 },
      foreground,
      {
        expandRadius: 1,
        featherRadius: 1,
        underpaintRadius: 3,
        holdoutStrength: 0.7,
        underpaintStrength: 0.9,
      },
    );

    const centerIndex = (7 * lower.width + 7) * 4;
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.imageData.data[centerIndex]).toBeGreaterThan(12);
    expect(result.imageData.data[centerIndex + 3]).toBeLessThan(255);

    const cornerIndex = 0;
    expect(result.imageData.data[cornerIndex]).toBe(240);
    expect(result.imageData.data[cornerIndex + 3]).toBe(255);
  });

  it("extends lower-layer holdout into the foreground motion sweep", () => {
    const lower = makeFilledImageData(15, 15, [240, 240, 240, 255]);
    for (let y = 0; y < lower.height; y += 1) {
      setPixel(lower, 10, y, [12, 12, 12, 255]);
    }
    const foreground = makeFilledImageData(3, 3, [80, 220, 80, 255]);

    const result = cleanupLowerLayerImageDataByForegroundMask(
      { x: 0, y: 0, width: 15, height: 15 },
      lower,
      { x: 5, y: 5, width: 3, height: 3 },
      foreground,
      {
        expandRadius: 0,
        featherRadius: 0,
        motionSweepRadiusX: 4,
        motionSweepRadiusY: 0,
        motionSweepStrength: 1,
        holdoutStrength: 0.7,
        underpaintRadius: 3,
        underpaintStrength: 0.9,
      },
    );

    const sweptLineIndex = (6 * lower.width + 10) * 4;
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.imageData.data[sweptLineIndex]).toBeGreaterThan(12);
    expect(result.imageData.data[sweptLineIndex + 3]).toBeLessThan(255);
  });

  it("contextually completes deeper lower-layer holes before underpainting", () => {
    const lower = makeFilledImageData(13, 7, [226, 178, 168, 255]);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 4; x <= 8; x += 1) {
        setPixel(lower, x, y, [24, 24, 24, 255]);
      }
    }
    const foreground = makeFilledImageData(5, 3, [80, 220, 80, 255]);

    const result = cleanupLowerLayerImageDataByForegroundMask(
      { x: 0, y: 0, width: 13, height: 7 },
      lower,
      { x: 4, y: 2, width: 5, height: 3 },
      foreground,
      {
        expandRadius: 0,
        featherRadius: 0,
        underpaintRadius: 1,
        underpaintStrength: 1,
        holdoutStrength: 0,
        contextUnderpaintPasses: 8,
        contextUnderpaintStrength: 1,
        duplicateContourStrength: 0,
      },
    );

    const centerIndex = (3 * lower.width + 6) * 4;
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.imageData.data[centerIndex]).toBeGreaterThan(95);
    expect(result.imageData.data[centerIndex + 1]).toBeGreaterThan(75);
    expect(result.imageData.data[centerIndex + 2]).toBeGreaterThan(70);
    expect(result.imageData.data[centerIndex + 3]).toBe(255);
  });

  it("suppresses duplicate lower-layer contours owned by the foreground edge", () => {
    const lower = makeFilledImageData(13, 13, [226, 178, 168, 255]);
    for (let y = 2; y <= 10; y += 1) {
      setPixel(lower, 4, y, [12, 12, 12, 255]);
      setPixel(lower, 6, y, [12, 12, 12, 255]);
    }

    const foreground = makeFilledImageData(5, 9, [0, 0, 0, 0]);
    for (let y = 0; y < foreground.height; y += 1) {
      setPixel(foreground, 0, y, [12, 12, 12, 255]);
      for (let x = 1; x < foreground.width; x += 1) {
        setPixel(foreground, x, y, [80, 220, 80, 255]);
      }
    }

    const result = cleanupLowerLayerImageDataByForegroundMask(
      { x: 0, y: 0, width: 13, height: 13 },
      lower,
      { x: 4, y: 2, width: 5, height: 9 },
      foreground,
      {
        expandRadius: 0,
        featherRadius: 0,
        underpaintRadius: 2,
        underpaintStrength: 0,
        holdoutStrength: 0,
        duplicateContourRadius: 1,
        duplicateContourStrength: 1,
        contextUnderpaintPasses: 4,
        contextUnderpaintStrength: 1,
      },
    );

    const ownedContourIndex = (6 * lower.width + 4) * 4;
    const interiorLineIndex = (6 * lower.width + 6) * 4;
    expect(result.affectedPixels).toBeGreaterThan(0);
    expect(result.imageData.data[ownedContourIndex]).toBeGreaterThan(72);
    expect(result.imageData.data[ownedContourIndex + 3]).toBeLessThan(180);
    expect(result.imageData.data[interiorLineIndex]).toBe(12);
    expect(result.imageData.data[interiorLineIndex + 3]).toBe(255);
  });

  it("decontaminates light foreground edge pixels toward the interior color", () => {
    const hair = createViviMesh({
      id: "hair",
      semanticRole: "hair",
      x: 0,
      y: 0,
      width: 7,
      height: 7,
    });
    const hairTexture = makeFilledImageData(7, 7, [0, 0, 0, 0]);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        setPixel(hairTexture, x, y, [80, 220, 80, 255]);
      }
    }
    setPixel(hairTexture, 1, 3, [242, 246, 242, 220]);

    const textures = [{ layerId: "hair", imageData: hairTexture }];
    const result = applyLayerOcclusionCleanupToTextures([hair], textures, {
      edgeDecontaminationRadius: 4,
      edgeDecontaminationStrength: 1,
    });

    const fringeIndex = (3 * hairTexture.width + 1) * 4;
    const cleaned = textures[0]?.imageData.data;
    expect(result.foregroundProcessedLayerIds).toEqual(["hair"]);
    expect(cleaned?.[fringeIndex]).toBeLessThan(242);
    expect(cleaned?.[fringeIndex + 2]).toBeLessThan(242);
    expect(cleaned?.[fringeIndex + 1]).toBeGreaterThan(180);
  });

  it("applies cleanup only to lower semantic-role targets", () => {
    const hair = createViviMesh({
      id: "hair",
      semanticRole: "hair",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const face = createViviMesh({
      id: "face",
      semanticRole: "face",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const accessory = createViviMesh({
      id: "accessory",
      semanticRole: "accessory",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const hairTexture = makeFilledImageData(4, 4, [80, 220, 80, 255]);
    const faceTexture = makeFilledImageData(4, 4, [20, 20, 20, 255]);
    const accessoryTexture = makeFilledImageData(4, 4, [20, 20, 20, 255]);

    const textures = [
      { layerId: "hair", imageData: hairTexture },
      { layerId: "face", imageData: faceTexture },
      { layerId: "accessory", imageData: accessoryTexture },
    ];

    const result = applyLayerOcclusionCleanupToTextures(
      [hair, face, accessory],
      textures,
      { expandRadius: 0, featherRadius: 0, holdoutStrength: 0.7 },
    );

    expect(result.processedLayerIds).toEqual(["face"]);
    expect(textures.find((texture) => texture.layerId === "face")?.imageData.data[3]).toBeLessThan(
      255,
    );
    expect(textures.find((texture) => texture.layerId === "hair")?.imageData.data[3]).toBe(255);
    expect(textures.find((texture) => texture.layerId === "accessory")?.imageData.data[3]).toBe(
      255,
    );
  });

  it("rolls back texture references when a planned cleanup step fails", () => {
    const hair = createViviMesh({
      id: "hair",
      semanticRole: "hair",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const face = createViviMesh({
      id: "face",
      semanticRole: "face",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const hairTexture = makeFilledImageData(4, 4, [80, 220, 80, 255]);
    const faceTexture = makeFilledImageData(4, 4, [226, 178, 168, 255]);
    const replacementHair = makeFilledImageData(4, 4, [10, 10, 10, 255]);
    const textures = [
      { layerId: "hair", imageData: hairTexture },
      { layerId: "face", imageData: faceTexture },
    ];
    const plan = createLayerOcclusionCleanupPlan([hair, face], textures);

    expect(plan.provenance.commandId).toBe("vivi.layerOcclusionCleanup");
    expect(plan.rollback.snapshotLayerIds).toEqual(["hair", "face"]);
    expect(() =>
      applyLayerOcclusionCleanupPlan(plan, textures, {
        decontaminateForegroundEdges: () => ({
          imageData: replacementHair,
          affectedPixels: 1,
        }),
        cleanupLowerLayerImageDataByForegroundMask: () => {
          throw new Error("cleanup failed");
        },
      }),
    ).toThrow("cleanup failed");
    expect(textures[0]?.imageData).toBe(hairTexture);
    expect(textures[1]?.imageData).toBe(faceTexture);
  });

  it("rolls back earlier lower-layer results when a later planned pair fails", () => {
    const hair = createViviMesh({
      id: "hair",
      semanticRole: "hair",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const tail = createViviMesh({
      id: "tail",
      semanticRole: "tail",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const face = createViviMesh({
      id: "face",
      semanticRole: "face",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const hairTexture = makeFilledImageData(4, 4, [80, 220, 80, 255]);
    const tailTexture = makeFilledImageData(4, 4, [60, 180, 60, 255]);
    const faceTexture = makeFilledImageData(4, 4, [226, 178, 168, 255]);
    const replacementFace = makeFilledImageData(4, 4, [32, 32, 32, 255]);
    const textures = [
      { layerId: "hair", imageData: hairTexture },
      { layerId: "tail", imageData: tailTexture },
      { layerId: "face", imageData: faceTexture },
    ];
    const plan = createLayerOcclusionCleanupPlan([hair, tail, face], textures);
    let lowerCallCount = 0;

    expect(() =>
      applyLayerOcclusionCleanupPlan(plan, textures, {
        decontaminateForegroundEdges: (imageData) => ({
          imageData,
          affectedPixels: 0,
        }),
        cleanupLowerLayerImageDataByForegroundMask: () => {
          lowerCallCount += 1;
          if (lowerCallCount === 1) {
            return { imageData: replacementFace, affectedPixels: 1 };
          }
          throw new Error("second pair failed");
        },
      }),
    ).toThrow("second pair failed");
    expect(lowerCallCount).toBe(2);
    expect(textures[0]?.imageData).toBe(hairTexture);
    expect(textures[1]?.imageData).toBe(tailTexture);
    expect(textures[2]?.imageData).toBe(faceTexture);
  });

  it("rejects in-place executor results that would make rollback unsafe", () => {
    const hair = createViviMesh({
      id: "hair",
      semanticRole: "hair",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });
    const hairTexture = makeFilledImageData(4, 4, [80, 220, 80, 255]);
    const textures = [{ layerId: "hair", imageData: hairTexture }];
    const plan = createLayerOcclusionCleanupPlan([hair], textures);

    expect(() =>
      applyLayerOcclusionCleanupPlan(plan, textures, {
        decontaminateForegroundEdges: (imageData) => ({
          imageData,
          affectedPixels: 1,
        }),
      }),
    ).toThrow("must return a new ImageData");
    expect(textures[0]?.imageData).toBe(hairTexture);
  });

  it("builds a geometry preview for lower-layer holdout and duplicate contour cleanup", () => {
    const hair = createViviMesh({
      id: "hair",
      name: "Front Hair",
      semanticRole: "hairFront",
      x: 2,
      y: 0,
      width: 8,
      height: 8,
    });
    const face = createViviMesh({
      id: "face",
      name: "Face",
      semanticRole: "face",
      x: 4,
      y: 1,
      width: 8,
      height: 8,
    });
    const body = createViviMesh({
      id: "body",
      name: "Body",
      semanticRole: "body",
      x: 0,
      y: 8,
      width: 14,
      height: 8,
    });

    const report = buildLayerOcclusionCleanupPreviewReport([hair, face, body], {
      duplicateContourStrength: 1,
      motionSweepStrength: 1,
    });
    const facePair = report.pairReports.find(
      (pair) => pair.foregroundLayerId === "hair" && pair.lowerLayerId === "face",
    );

    expect(report.isEligible).toBe(true);
    expect(report.foregroundLayerCount).toBe(1);
    expect(report.lowerLayerCount).toBe(2);
    expect(report.pairCount).toBeGreaterThanOrEqual(2);
    expect(report.maxCleanupScore).toBeGreaterThan(0);
    expect(facePair?.operations).toEqual(
      expect.arrayContaining([
        "lower-holdout",
        "underpaint",
        "motion-sweep",
        "duplicate-contour",
      ]),
    );
    expect(facePair?.cleanupScore).toBeGreaterThan(0);
    expect(report.layerReports.some((layer) => layer.layerId === "face")).toBe(true);
  });
});
