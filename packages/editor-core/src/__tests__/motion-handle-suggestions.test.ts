import { describe, expect, it } from "vitest";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import {
  suggestMotionHandles,
  type MotionHandleSuggestionContextRect,
  type MotionHandleSuggestionInput,
  type MotionHandleSuggestionMask,
} from "../motion-handle-suggestions";
import { getMotionSemanticPolicy } from "../motion-template-policy";

interface FillRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function mask(width: number, height: number, rects: readonly FillRect[]): MotionHandleSuggestionMask {
  const alpha = new Uint8Array(width * height);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        alpha[y * width + x] = 255;
      }
    }
  }
  return { width, height, alpha };
}

function input(
  role: LayerSemanticRole,
  sourceMask: MotionHandleSuggestionMask,
  contextRects: readonly MotionHandleSuggestionContextRect[],
): MotionHandleSuggestionInput {
  return {
    regionId: `region:${role}`,
    role,
    inputSource: "acceptedManualMask",
    mask: sourceMask,
    semanticPolicy: getMotionSemanticPolicy(role),
    contextRects,
  };
}

describe("motion handle suggestions", () => {
  it("suggests an auto-applicable root near the head for front hair", () => {
    const result = suggestMotionHandles(
      input(
        "hairFront",
        mask(48, 64, [{ x: 20, y: 16, width: 8, height: 32 }]),
        [{ kind: "head", x: 16, y: 4, width: 16, height: 8 }],
      ),
    );

    expect(result.status).toBe("apply");
    if (result.status !== "apply") return;
    expect(result.autoApplicable).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.tip).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.root.y).toBeLessThan(result.tip!.y);
    expect(result.warnings).not.toContain("manualReviewRequired");
  });

  it("uses the outward side as the tip for side hair", () => {
    const result = suggestMotionHandles(
      input(
        "hairSide",
        mask(48, 48, [{ x: 24, y: 12, width: 12, height: 24 }]),
        [{ kind: "head", x: 12, y: 12, width: 8, height: 24 }],
      ),
    );

    expect(result.status).toBe("apply");
    if (result.status !== "apply") return;
    expect(result.tip!.x).toBeGreaterThan(result.root.x);
  });

  it("anchors tails near the parent layer and points toward the far end", () => {
    const result = suggestMotionHandles(
      input(
        "tail",
        mask(72, 32, [{ x: 16, y: 12, width: 42, height: 8 }]),
        [{ kind: "body", x: 4, y: 8, width: 10, height: 16 }],
      ),
    );

    expect(result.status).toBe("apply");
    if (result.status !== "apply") return;
    expect(result.root.x).toBeLessThan(result.tip!.x);
  });

  it("requires review for round masks", () => {
    const result = suggestMotionHandles(
      input(
        "hair",
        mask(48, 48, [{ x: 16, y: 16, width: 14, height: 14 }]),
        [{ kind: "head", x: 14, y: 8, width: 18, height: 6 }],
      ),
    );

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.autoApplicable).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining(["roundMask"]));
  });

  it("requires review when a mask has multiple significant lobes", () => {
    const result = suggestMotionHandles(
      input(
        "hairBack",
        mask(64, 48, [
          { x: 16, y: 12, width: 8, height: 24 },
          { x: 40, y: 12, width: 8, height: 24 },
        ]),
        [{ kind: "head", x: 20, y: 4, width: 20, height: 8 }],
      ),
    );

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.warnings).toEqual(expect.arrayContaining(["multiLobeMask"]));
  });

  it("keeps protected face-adjacent accessories in review mode", () => {
    const result = suggestMotionHandles({
      ...input(
        "accessory",
        mask(40, 40, [{ x: 20, y: 14, width: 6, height: 6 }]),
        [{ kind: "face", x: 10, y: 10, width: 10, height: 14 }],
      ),
      semanticPolicy: getMotionSemanticPolicy("accessory", {
        nearProtectedFace: true,
        smallAccessory: true,
      }),
    });

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.autoApplicable).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["protectedFaceAdjacent", "manualReviewRequired"]),
    );
  });

  it("keeps protected face parts out of automatic handle apply", () => {
    const result = suggestMotionHandles(
      input(
        "face",
        mask(40, 40, [{ x: 12, y: 10, width: 16, height: 20 }]),
        [{ kind: "head", x: 10, y: 2, width: 20, height: 8 }],
      ),
    );

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.autoApplicable).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["protectedFaceAdjacent", "manualReviewRequired"]),
    );
  });

  it("keeps generic accessories in manual review even away from the face", () => {
    const result = suggestMotionHandles(
      input(
        "accessory",
        mask(40, 40, [{ x: 24, y: 20, width: 8, height: 12 }]),
        [{ kind: "body", x: 8, y: 18, width: 8, height: 12 }],
      ),
    );

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.autoApplicable).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining(["manualReviewRequired"]));
    expect(result.warnings).not.toContain("protectedFaceAdjacent");
  });

  it("rejects provider-shaped input without returning synthetic points", () => {
    const result = suggestMotionHandles({
      ...input("hair", mask(16, 16, [{ x: 4, y: 4, width: 8, height: 8 }]), []),
      providerId: "provider",
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["inputRejected"]));
  });

  it("rejects oversized masks without returning synthetic points", () => {
    const result = suggestMotionHandles({
      regionId: "region:huge",
      role: "hair",
      inputSource: "acceptedManualMask",
      mask: {
        width: 4097,
        height: 1,
        alpha: new Uint8Array(4097),
      },
      semanticPolicy: getMotionSemanticPolicy("hair"),
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
    expect("tip" in result).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["manualReviewRequired", "lowConfidence"]),
    );
  });

  it("rejects array alpha inputs", () => {
    const result = suggestMotionHandles({
      regionId: "region:bad",
      role: "hair",
      inputSource: "acceptedManualMask",
      mask: {
        width: 4,
        height: 4,
        alpha: new Array(16).fill(255),
      },
      semanticPolicy: getMotionSemanticPolicy("hair"),
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
  });

  it("rejects non-Uint8 typed array alpha inputs", () => {
    const result = suggestMotionHandles({
      regionId: "region:float-alpha",
      role: "hair",
      inputSource: "acceptedManualMask",
      mask: {
        width: 4,
        height: 4,
        alpha: new Float32Array(16),
      },
      semanticPolicy: getMotionSemanticPolicy("hair"),
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
  });

  it("rejects resizable ArrayBuffer-backed alpha when supported", () => {
    const ArrayBufferCtor = ArrayBuffer as typeof ArrayBuffer & {
      new (byteLength: number, options: { maxByteLength: number }): ArrayBuffer;
    };
    let resizable: ArrayBuffer | undefined;
    try {
      resizable = new ArrayBufferCtor(16, { maxByteLength: 32 });
    } catch {
      return;
    }

    const result = suggestMotionHandles({
      regionId: "region:resizable-alpha",
      role: "hair",
      inputSource: "acceptedManualMask",
      mask: {
        width: 4,
        height: 4,
        alpha: new Uint8Array(resizable),
      },
      semanticPolicy: getMotionSemanticPolicy("hair"),
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
  });

  it("rejects accessor-shaped inputs without invoking the getter", () => {
    let getterInvoked = false;
    const source = {
      regionId: "region:getter",
      role: "hair",
      mask: mask(16, 16, [{ x: 4, y: 4, width: 8, height: 8 }]),
      semanticPolicy: getMotionSemanticPolicy("hair"),
    };
    Object.defineProperty(source, "contextRects", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return [];
      },
    });

    const result = suggestMotionHandles(source);

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
    expect(getterInvoked).toBe(false);
  });

  it("rejects invalid context rectangles without returning points", () => {
    const result = suggestMotionHandles({
      ...input("hair", mask(16, 16, [{ x: 4, y: 4, width: 8, height: 8 }]), []),
      contextRects: [{ kind: "head", x: 0, y: 0, width: -1, height: 8 }],
    });

    expect(result.status).toBe("rejected");
    expect("root" in result).toBe(false);
    expect("tip" in result).toBe(false);
  });

  it("keeps region-bounds pseudo masks out of automatic apply", () => {
    const result = suggestMotionHandles({
      ...input(
        "hairFront",
        mask(48, 64, [{ x: 20, y: 16, width: 8, height: 32 }]),
        [{ kind: "head", x: 16, y: 4, width: 16, height: 8 }],
      ),
      inputSource: "regionBoundsPseudoMask",
    });

    expect(result.status).toBe("review");
    if (result.status !== "review") return;
    expect(result.autoApplicable).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining(["manualReviewRequired"]));
  });

  it("copies alpha before analysis so caller mutation cannot change the result", () => {
    const alpha = mask(32, 32, [{ x: 12, y: 8, width: 6, height: 18 }]).alpha;
    const sourceInput = input(
      "hairFront",
      { width: 32, height: 32, alpha },
      [{ kind: "head", x: 10, y: 2, width: 10, height: 5 }],
    );

    const result = suggestMotionHandles(sourceInput);
    alpha.fill(0);

    expect(result.status).toBe("apply");
    if (result.status !== "apply") return;
    expect(result.root.y).toBeLessThan(result.tip!.y);
  });

  it("returns only closed reasons and avoids implementation terminology", () => {
    const result = suggestMotionHandles(
      input(
        "tail",
        mask(48, 24, [{ x: 8, y: 8, width: 30, height: 6 }]),
        [{ kind: "body", x: 0, y: 4, width: 6, height: 12 }],
      ),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(
      /PCA|covariance|eigenvector|moment|solver|deformer|vertex|component/i,
    );
    expect(result.reasons.every((reason) => typeof reason === "string")).toBe(true);
  });
});
