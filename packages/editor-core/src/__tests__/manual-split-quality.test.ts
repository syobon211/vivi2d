import { describe, expect, it } from "vitest";
import {
  analyzeManualSplitQuality,
  hasManualSplitQualityBlockers,
  type ManualSplitAlphaMaskView,
  type ManualSplitQualityMask,
} from "../manual-split-quality";

function mask(
  width: number,
  height: number,
  points: readonly Array<readonly [number, number]>,
  alpha = 255,
): ManualSplitAlphaMaskView {
  const data = new Uint8ClampedArray(width * height);
  for (const [x, y] of points) data[y * width + x] = alpha;
  return { width, height, alpha: data };
}

function fullSource(width: number, height: number): ManualSplitAlphaMaskView {
  return {
    width,
    height,
    alpha: new Uint8ClampedArray(width * height).fill(255),
  };
}

function qualityMask(
  id: string,
  role: ManualSplitQualityMask["role"],
  value: ManualSplitAlphaMaskView,
): ManualSplitQualityMask {
  return { id, role, mask: value };
}

describe("manual split quality", () => {
  it("detects unassigned opaque pixels below the hard-loss blocker threshold", () => {
    const report = analyzeManualSplitQuality({
      sourceAlpha: fullSource(10, 10),
      masks: [
        qualityMask(
          "hair",
          "hair",
          mask(
            10,
            10,
            Array.from({ length: 98 }, (_, index) => [
              index % 10,
              Math.floor(index / 10),
            ]),
          ),
        ),
      ],
      policy: {
        maxHighAlphaPixelsLostRatio: 0.05,
        maxUnassignedOpaquePixelsWarningRatio: 0.005,
      },
    });

    expect(report.status).toBe("warning");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "unassignedOpaquePixels",
          severity: "warning",
        }),
      ]),
    );
  });

  it("detects overlap between non-protected masks", () => {
    const report = analyzeManualSplitQuality({
      sourceAlpha: fullSource(4, 4),
      masks: [
        qualityMask("hair", "hair", mask(4, 4, [[1, 1], [1, 2]])),
        qualityMask("body", "body", mask(4, 4, [[1, 1], [2, 2]])),
      ],
      policy: { maxOverlapRatioBlocker: 0.5, maxHighAlphaPixelsLostRatio: 1 },
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "maskOverlap",
          severity: "warning",
          repairActions: ["resolveOverlap"],
        }),
      ]),
    );
  });

  it("blocks protected face pixels inside a moving hair mask", () => {
    const report = analyzeManualSplitQuality({
      sourceAlpha: fullSource(4, 4),
      masks: [
        qualityMask("face", "face", mask(4, 4, [[1, 1], [2, 1]])),
        qualityMask("hair", "hair", mask(4, 4, [[1, 1], [1, 2]])),
      ],
      policy: { maxHighAlphaPixelsLostRatio: 1 },
    });

    expect(report.status).toBe("blocked");
    expect(hasManualSplitQualityBlockers(report)).toBe(true);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "protectedSemanticContamination",
          severity: "blocker",
          repairActions: ["reviewProtectedRegion", "resolveOverlap"],
        }),
      ]),
    );
  });

  it("warns about tiny islands and offers island removal", () => {
    const report = analyzeManualSplitQuality({
      sourceAlpha: fullSource(8, 8),
      masks: [
        qualityMask(
          "tail",
          "tail",
          mask(8, 8, [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
            [6, 6],
          ]),
        ),
      ],
      policy: { maxHighAlphaPixelsLostRatio: 1, tinyIslandMaxPixels: 2 },
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tinyIsland",
          severity: "warning",
          repairActions: ["removeIslands"],
        }),
      ]),
    );
  });

  it("is deterministic for the same mask bytes", () => {
    const input = {
      sourceAlpha: fullSource(5, 5),
      masks: [
        qualityMask("hair", "hair", mask(5, 5, [[0, 0], [1, 0], [4, 4]])),
        qualityMask("face", "face", mask(5, 5, [[2, 2]])),
      ],
      requiredRoles: ["hair", "face"] as const,
      policy: { maxHighAlphaPixelsLostRatio: 1 },
    };

    expect(analyzeManualSplitQuality(input)).toEqual(analyzeManualSplitQuality(input));
  });

  it("blocks apply-readiness when required semantics are missing", () => {
    const report = analyzeManualSplitQuality({
      sourceAlpha: fullSource(3, 3),
      masks: [qualityMask("hair", "hair", mask(3, 3, [[1, 1]]))],
      requiredRoles: ["hair", "face"],
      policy: { maxHighAlphaPixelsLostRatio: 1 },
    });

    expect(report.status).toBe("blocked");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missingRequiredSemantic",
          role: "face",
          severity: "blocker",
        }),
      ]),
    );
  });
});
