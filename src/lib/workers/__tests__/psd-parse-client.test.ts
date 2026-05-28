import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubProject = { name: "stub", width: 1, height: 1, layers: [] } as any;

vi.mock("@/lib/psd-loader", () => ({
  parsePsd: vi.fn(() => stubProject),
}));

vi.mock("@/lib/texture-store", () => ({
  clearTextures: vi.fn(),
  setTextureFromImageData: vi.fn(),
}));

vi.mock("@/lib/workers/worker-runner", () => ({
  runWorker: vi.fn(),
}));

vi.mock("@/workers/psd-parse.worker?worker", () => ({
  default: class FakeWorker {
    terminate() {}
  },
}));

import { parsePsd } from "@/lib/psd-loader";
import { clearTextures, setTextureFromImageData } from "@/lib/texture-store";
import { parsePsdAsync } from "@/lib/workers/psd-parse-client";
import { runWorker } from "@/lib/workers/worker-runner";

describe("parsePsdAsync", () => {
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

  it("Worker 非対応環境では parsePsd を同期呼び出しし commitTextures は no-op", async () => {
    delete (globalThis as any).Worker;
    const buffer = new ArrayBuffer(8);
    const result = await parsePsdAsync(buffer, "test.psd");
    expect(parsePsd).toHaveBeenCalledWith(buffer, "test.psd");
    expect(runWorker).not.toHaveBeenCalled();
    expect(result.project).toBe(stubProject);
    result.commitTextures();
    expect(clearTextures).not.toHaveBeenCalled();
  });

  it("Worker 対応環境では runWorker を呼び commitTextures で texture-store に反映", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    const tex = {
      layerId: "L1",
      width: 2,
      height: 2,
      buffer: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      ]).buffer,
    };
    (runWorker as any).mockResolvedValueOnce({
      project: stubProject,
      textures: [tex],
    });
    const buffer = new ArrayBuffer(16);
    const result = await parsePsdAsync(buffer, "a.psd");
    expect(runWorker).toHaveBeenCalledOnce();
    expect(clearTextures).not.toHaveBeenCalled();
    result.commitTextures();
    expect(clearTextures).toHaveBeenCalledOnce();
    expect(setTextureFromImageData).toHaveBeenCalledWith("L1", expect.any(ImageData));
  });

  it("transferInput=true で buffer を transfer に含めて送信する", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    (runWorker as any).mockResolvedValueOnce({
      project: stubProject,
      textures: [],
    });
    const buffer = new ArrayBuffer(32);
    await parsePsdAsync(buffer, "x.psd", { transferInput: true });
    const call = (runWorker as any).mock.calls[0][0];
    expect(call.request.buffer).toBe(buffer);
    expect(call.transfer[0]).toBe(buffer);
  });

  it("transferInput 未指定では入力 buffer をコピーして送る", async () => {
    (globalThis as any).Worker =
      originalWorker ??
      class StubWorker {
        terminate() {}
      };
    (runWorker as any).mockResolvedValueOnce({
      project: stubProject,
      textures: [],
    });
    const buffer = new ArrayBuffer(32);
    await parsePsdAsync(buffer, "x.psd");
    const call = (runWorker as any).mock.calls[0][0];
    expect(call.request.buffer).not.toBe(buffer);
    expect(call.request.buffer.byteLength).toBe(32);
  });
});
