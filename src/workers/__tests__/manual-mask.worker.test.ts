import { describe, expect, it } from "vitest";
import { handleManualMaskRequest, type ManualMaskWorkerRequest } from "../manual-mask.worker";

function makeAlpha(width: number, height: number, filled: readonly number[]): ArrayBuffer {
  const alpha = new Uint8ClampedArray(width * height);
  for (const index of filled) alpha[index] = 255;
  return alpha.buffer;
}

function makeRequest(
  partial: Partial<ManualMaskWorkerRequest>,
): ManualMaskWorkerRequest {
  return {
    operationId: "op-1",
    baseDraftGeneration: 3,
    targetBufferId: "hair",
    width: 4,
    height: 4,
    alphaBuffer: makeAlpha(4, 4, [5]),
    operation: { kind: "grow", radius: 1 },
    ...partial,
  };
}

describe("handleManualMaskRequest", () => {
  it("applies morphology operations and preserves request identity", () => {
    const response = handleManualMaskRequest(makeRequest({}));
    if (response.type !== "result") {
      throw new Error(`unexpected response: ${response.type}`);
    }
    const alpha = new Uint8ClampedArray(response.result.alphaBuffer);
    expect(response.result.operationId).toBe("op-1");
    expect(response.result.baseDraftGeneration).toBe(3);
    expect(response.result.targetBufferId).toBe("hair");
    expect([...alpha].filter((value) => value > 0).length).toBeGreaterThan(1);
  });

  it("rejects malformed buffer dimensions", () => {
    const response = handleManualMaskRequest(
      makeRequest({
        width: 4,
        height: 4,
        alphaBuffer: new ArrayBuffer(3),
      }),
    );
    expect(response.type).toBe("error");
  });

  it("can grow a color region from source pixels", () => {
    const source = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < source.length; i += 4) {
      source[i] = i < 8 * 4 ? 12 : 200;
      source[i + 3] = 255;
    }
    const response = handleManualMaskRequest(
      makeRequest({
        alphaBuffer: new ArrayBuffer(16),
        operation: {
          kind: "regionGrow",
          x: 0,
          y: 0,
          tolerance: 8,
          mode: "add",
          sourceRgbaBuffer: source.buffer,
        },
      }),
    );
    if (response.type !== "result") {
      throw new Error(`unexpected response: ${response.type}`);
    }
    const alpha = new Uint8ClampedArray(response.result.alphaBuffer);
    expect([...alpha].filter((value) => value > 0)).toHaveLength(8);
  });
});
