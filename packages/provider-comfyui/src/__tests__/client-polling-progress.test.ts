import { describe, expect, it, vi } from "vitest";
import { ComfyUIClient } from "../client";
import type { ComfyUITransport } from "../transport";

function makePollingTransport(
  getHistory: ComfyUITransport["getHistory"],
): ComfyUITransport {
  return {
    ping: vi.fn(async () => true),
    uploadImage: vi.fn(async () => "x.png"),
    enqueue: vi.fn(async () => ({ prompt_id: "p", number: 1 })),
    getHistory,
    downloadOutput: vi.fn(async () => new ArrayBuffer(0)),
    getWebSocketUrl: vi.fn(() => null),
  };
}

describe("ComfyUIClient polling progress", () => {
  it("emits synthetic progress while polling has not completed yet", async () => {
    vi.useFakeTimers();
    try {
      const history = {
        outputs: { n: { text: ["a.psd"] } },
        status: { completed: true, status_str: "success" },
      };
      const getHistory = vi
        .fn<ComfyUITransport["getHistory"]>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(history);
      const client = new ComfyUIClient({
        transport: makePollingTransport(getHistory),
        timeout: 10_000,
      });
      const onProgress = vi.fn();

      const completion = client.waitForCompletion("p", onProgress);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(completion).resolves.toBe(history);
      expect(onProgress).toHaveBeenCalledWith(5, 100);
      expect(onProgress.mock.calls.at(-1)?.[0]).toBeGreaterThan(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
