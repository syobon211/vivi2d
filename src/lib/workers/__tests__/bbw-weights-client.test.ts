import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vivi2d/core/bbw-weights", () => ({
  computeBBWWeights: vi.fn(() => [[{ boneIndex: 0, weight: 1 }]]),
}));

vi.mock("@/lib/workers/worker-runner", () => ({
  runWorker: vi.fn(async () => [[{ boneIndex: 0, weight: 1 }]]),
}));

vi.mock("@/workers/bbw-weights.worker?worker", () => ({
  default: class FakeWorker {
    terminate() {}
  },
}));

import { computeBBWWeights } from "@vivi2d/core/bbw-weights";
import { computeBBWWeightsAsync } from "@/lib/workers/bbw-weights-client";
import { runWorker } from "@/lib/workers/worker-runner";

describe("computeBBWWeightsAsync", () => {
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

  it("Worker 非対応環境では computeBBWWeights を同期呼び出しする", async () => {
    delete (globalThis as any).Worker;
    const bones = [{ id: "b1", x: 0, y: 0, parentId: null }];
    const result = await computeBBWWeightsAsync([0, 0, 1, 0, 1, 1], [0, 1, 2], bones);
    expect(computeBBWWeights).toHaveBeenCalledTimes(1);
    expect(runWorker).not.toHaveBeenCalled();
    expect(result).toEqual([[{ boneIndex: 0, weight: 1 }]]);
  });

  it("Worker 対応環境では runWorker 経由で結果を返す", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const result = await computeBBWWeightsAsync([0, 0], [0], []);
    expect(runWorker).toHaveBeenCalledOnce();
    expect(computeBBWWeights).not.toHaveBeenCalled();
    expect(result).toEqual([[{ boneIndex: 0, weight: 1 }]]);
  });

  it("options と signal を request 経由で Worker に伝達する", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const signal = new AbortController().signal;
    await computeBBWWeightsAsync(
      [0, 0, 1, 0],
      [0, 1, 0],
      [],
      { heatDiffusion: true } as any,
      { signal },
    );
    const call = (runWorker as any).mock.calls[0][0];
    expect(call.request.options.heatDiffusion).toBe(true);
    expect(call.signal).toBe(signal);
  });
});
