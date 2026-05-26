import { describe, expect, it } from "vitest";
import { runWorker } from "../worker-runner";


type Listener<T extends Event = Event> = (ev: T) => void;

class FakeWorker {
  private listeners: Record<string, Listener[]> = {};
  terminated = false;
  lastPosted: { data: unknown; transfer: unknown } | null = null;

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    const arr = this.listeners[type];
    if (!arr) return;
    this.listeners[type] = arr.filter((l) => l !== listener);
  }

  postMessage(data: unknown, transfer?: unknown): void {
    this.lastPosted = { data, transfer: transfer ?? [] };
  }

  terminate(): void {
    this.terminated = true;
  }

  dispatchMessage(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    for (const l of this.listeners.message ?? []) l(event);
  }

  dispatchError(message: string): void {
    const event = { message } as ErrorEvent;
    for (const l of this.listeners.error ?? []) l(event);
  }
}

function makeRun<T>(worker: FakeWorker, signal?: AbortSignal): Promise<T> {
  return runWorker<unknown, T>({
    createWorker: () => worker as unknown as Worker,
    request: { hello: 1 },
    signal,
    errorLabel: "fake error",
  });
}

describe("runWorker", () => {
  it("type:result のメッセージで Promise が resolve され Worker は terminate される", async () => {
    const worker = new FakeWorker();
    const p = makeRun<number>(worker);
    worker.dispatchMessage({ type: "result", result: 42 });
    await expect(p).resolves.toBe(42);
    expect(worker.terminated).toBe(true);
  });

  it("type:error のメッセージで reject され message が伝播する", async () => {
    const worker = new FakeWorker();
    const p = makeRun(worker);
    worker.dispatchMessage({ type: "error", message: "bad thing" });
    await expect(p).rejects.toThrow("bad thing");
    expect(worker.terminated).toBe(true);
  });

  it("error イベントで errorLabel にフォールバック reject される", async () => {
    const worker = new FakeWorker();
    const p = makeRun(worker);
    worker.dispatchError("");
    await expect(p).rejects.toThrow("fake error");
    expect(worker.terminated).toBe(true);
  });

  it("既に abort された signal を渡すと即座に AbortError で reject される", async () => {
    const worker = new FakeWorker();
    const ac = new AbortController();
    ac.abort();
    const p = makeRun(worker, ac.signal);
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("実行中に abort されると terminate されて AbortError で reject される", async () => {
    const worker = new FakeWorker();
    const ac = new AbortController();
    const p = makeRun(worker, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
  });

  it("result 後に追加 message が来ても再度 resolve/terminate されない", async () => {
    const worker = new FakeWorker();
    const p = makeRun<number>(worker);
    worker.dispatchMessage({ type: "result", result: 1 });
    await p;
    expect(worker.terminated).toBe(true);
    worker.dispatchMessage({ type: "result", result: 2 });
  });

  it("transfer が指定された場合は postMessage に transfer 配列が渡る", async () => {
    const worker = new FakeWorker();
    const buffer = new ArrayBuffer(8);
    const p = runWorker<{ buf: ArrayBuffer }, number>({
      createWorker: () => worker as unknown as Worker,
      request: { buf: buffer },
      transfer: [buffer],
      errorLabel: "x",
    });
    expect(worker.lastPosted?.transfer).toEqual([buffer]);
    worker.dispatchMessage({ type: "result", result: 0 });
    await p;
  });

  it("progress メッセージは握りつぶす（resolve/reject しない）", async () => {
    const worker = new FakeWorker();
    const p = makeRun<string>(worker);
    worker.dispatchMessage({ type: "progress", progress: 0.5 });
    worker.dispatchMessage({ type: "result", result: "ok" });
    await expect(p).resolves.toBe("ok");
  });
});
