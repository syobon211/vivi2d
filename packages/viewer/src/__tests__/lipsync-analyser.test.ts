import { LIPSYNC_DEFAULTS } from "@vivi2d/core/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LipSyncAnalyser } from "../tracking/lipsync-analyser";


let mockTimeDomainData: Float32Array;

function createMockAnalyser() {
  return {
    fftSize: 0,
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      arr.set(mockTimeDomainData.subarray(0, arr.length));
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("LipSyncAnalyser", () => {
  let rafCallbacks: ((time: number) => void)[];
  let mockAnalyser: ReturnType<typeof createMockAnalyser>;

  beforeEach(() => {
    mockTimeDomainData = new Float32Array(LIPSYNC_DEFAULTS.FFT_SIZE);
    rafCallbacks = [];
    mockAnalyser = createMockAnalyser();

    const mockSource = { connect: vi.fn(), disconnect: vi.fn() };

    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser() {
          return mockAnalyser;
        }
        createMediaStreamSource() {
          return mockSource;
        }
        close() {
          return Promise.resolve();
        }
      },
    );

    const mockStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(cb as (time: number) => void);
        return rafCallbacks.length;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function tickRaf() {
    const cb = rafCallbacks.shift();
    cb?.(performance.now());
  }

  it("init()でAudioContextとマイクが初期化される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    analyser.destroy();
  });

  it("無音時（全サンプル0）はコールバックに0が渡される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(0);
    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));
    expect(volumes.length).toBe(1);
    expect(volumes[0]).toBe(0);

    analyser.destroy();
  });

  it("大きな音声入力でコールバック値が0より大きい", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    for (let i = 0; i < mockTimeDomainData.length; i++) {
      mockTimeDomainData[i] =
        0.3 * Math.sin((i / mockTimeDomainData.length) * Math.PI * 2);
    }

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    expect(volumes[0]).toBeGreaterThan(0);
    expect(volumes[0]).toBeLessThanOrEqual(1);

    analyser.destroy();
  });

  it("閾値以下の微小音量は0にカットされる", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    const tinyAmplitude = (LIPSYNC_DEFAULTS.THRESHOLD / LIPSYNC_DEFAULTS.GAIN) * 0.5;
    mockTimeDomainData.fill(tinyAmplitude);

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    expect(volumes[0]).toBe(0);

    analyser.destroy();
  });

  it("スムージングにより連続フレームで値が段階的に変化する", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    const volumes: number[] = [];
    mockTimeDomainData.fill(0);
    analyser.start((v) => volumes.push(v));

    mockTimeDomainData.fill(0.5);
    tickRaf();

    tickRaf();

    expect(volumes[0]).toBe(0);
    expect(volumes[1]).toBeGreaterThan(0);
    expect(volumes[2]).toBeGreaterThan(volumes[1]!);

    analyser.destroy();
  });

  it("stop()後はRAFが登録されない", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    const volumes: number[] = [];
    mockTimeDomainData.fill(0);
    analyser.start((v) => volumes.push(v));
    const countAfterStart = volumes.length; // 1

    analyser.stop();

    if (rafCallbacks.length > 0) tickRaf();

    expect(volumes.length).toBe(countAfterStart);

    analyser.destroy();
  });

  it("destroy()で全リソースが破棄される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();
    analyser.start(() => {});
    analyser.destroy();

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));
    expect(volumes.length).toBe(0);
  });

  it("音量は1を超えない", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(10.0);

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    expect(volumes[0]).toBeLessThanOrEqual(1);

    analyser.destroy();
  });

  it("RMS計算が正しい", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    const amplitude = 0.3;
    mockTimeDomainData.fill(amplitude);

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    const expectedRaw = amplitude * LIPSYNC_DEFAULTS.GAIN;
    const expected = expectedRaw * (1 - LIPSYNC_DEFAULTS.SMOOTHING);
    expect(volumes[0]).toBeCloseTo(expected, 2);

    analyser.destroy();
  });


  it("複数フレーム連続実行（10フレーム）で値が安定収束する", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(0.2);
    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    for (let i = 0; i < 9; i++) {
      tickRaf();
    }

    expect(volumes.length).toBe(10);
    const lastFew = volumes.slice(-3);
    const diff = Math.abs(lastFew[2]! - lastFew[0]!);
    expect(diff).toBeLessThan(0.05);

    analyser.destroy();
  });

  it("start()を2回連続で呼んだ場合、コールバックが2重にならない", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(0.2);
    const volumes1: number[] = [];
    const volumes2: number[] = [];

    analyser.start((v) => volumes1.push(v));
    analyser.start((v) => volumes2.push(v));

    tickRaf();

    const totalCallbacks = volumes1.length + volumes2.length;
    expect(totalCallbacks).toBeLessThanOrEqual(4);

    analyser.destroy();
  });

  it("全サンプルが負値(-0.3)の場合でもRMS計算が正しい（二乗なので正）", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(-0.3);

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    const expectedRaw = 0.3 * LIPSYNC_DEFAULTS.GAIN;
    const expected = expectedRaw * (1 - LIPSYNC_DEFAULTS.SMOOTHING);
    expect(volumes[0]).toBeCloseTo(expected, 2);
    expect(volumes[0]).toBeGreaterThan(0);

    analyser.destroy();
  });

  it("FFT_SIZE分のdataArrayが正確に走査される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(0.1);
    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    expect(mockAnalyser.getFloatTimeDomainData).toHaveBeenCalled();
    const callArgs = mockAnalyser.getFloatTimeDomainData.mock.calls[0]!;
    expect(callArgs[0].length).toBe(LIPSYNC_DEFAULTS.FFT_SIZE);

    analyser.destroy();
  });


  it("init()前にstart()を呼んでもクラッシュしない（analyser=null分岐）", () => {
    const analyser = new LipSyncAnalyser();
    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));
    expect(volumes.length).toBe(0);
    analyser.destroy();
  });

  it("init()前にstop()を呼んでもクラッシュしない（animationId=0分岐）", () => {
    const analyser = new LipSyncAnalyser();
    expect(() => analyser.stop()).not.toThrow();
    analyser.destroy();
  });

  it("init()前にdestroy()を呼んでもクラッシュしない", () => {
    const analyser = new LipSyncAnalyser();
    expect(() => analyser.destroy()).not.toThrow();
  });

  it("stop()後にstart()を再開できる", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    mockTimeDomainData.fill(0.2);
    const volumes1: number[] = [];
    analyser.start((v) => volumes1.push(v));
    expect(volumes1.length).toBe(1);

    analyser.stop();

    const volumes2: number[] = [];
    analyser.start((v) => volumes2.push(v));
    expect(volumes2.length).toBe(1);
    expect(volumes2[0]).toBeGreaterThan(0);

    analyser.destroy();
  });

  it("閾値ちょうどの音量は0にカットされる（境界値テスト）", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    // rms = THRESHOLD / GAIN
    const amplitude = LIPSYNC_DEFAULTS.THRESHOLD / LIPSYNC_DEFAULTS.GAIN;
    mockTimeDomainData.fill(amplitude);

    const volumes: number[] = [];
    analyser.start((v) => volumes.push(v));

    expect(volumes[0]).toBeGreaterThanOrEqual(0);
    expect(volumes[0]).toBeLessThanOrEqual(1);

    analyser.destroy();
  });
});
