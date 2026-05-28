import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workers/worker-runner", () => ({
  runWorker: vi.fn(async ({ request }) => ({
    operationId: request.operationId,
    baseDraftGeneration: request.baseDraftGeneration,
    targetBufferId: request.targetBufferId,
    width: request.width,
    height: request.height,
    alphaBuffer: request.alphaBuffer,
  })),
}));

vi.mock("@/workers/manual-mask.worker?worker", () => ({
  default: class FakeWorker {
    terminate() {}
  },
}));

import { createMaskBuffer } from "@/lib/manual-layer-split/mask-ops";
import { runManualMaskOperationAsync } from "@/lib/workers/manual-mask-client";
import { runWorker } from "@/lib/workers/worker-runner";

describe("runManualMaskOperationAsync", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalWorker) {
      (globalThis as any).Worker = originalWorker;
    } else {
      delete (globalThis as any).Worker;
    }
  });

  it("falls back to synchronous operations without Worker support", async () => {
    delete (globalThis as any).Worker;
    const mask = createMaskBuffer("hair", 4, 4);
    mask.alpha[5] = 255;
    const result = await runManualMaskOperationAsync(
      mask,
      { kind: "grow", radius: 1 },
      { operationId: "op", baseDraftGeneration: 1 },
    );
    expect(runWorker).not.toHaveBeenCalled();
    expect(result.operationId).toBe("op");
    expect([...new Uint8ClampedArray(result.alphaBuffer)].filter((value) => value > 0).length).toBeGreaterThan(1);
  });

  it("uses worker-runner and transfers buffers when Worker is supported", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const mask = createMaskBuffer("hair", 2, 2, 255);
    const signal = new AbortController().signal;
    await runManualMaskOperationAsync(
      mask,
      { kind: "shrink", radius: 1 },
      { operationId: "op", baseDraftGeneration: 2, signal },
    );
    expect(runWorker).toHaveBeenCalledOnce();
    const call = (runWorker as any).mock.calls[0][0];
    expect(call.request.operation.kind).toBe("shrink");
    expect(call.transfer).toHaveLength(1);
    expect(call.signal).toBe(signal);
  });
});
