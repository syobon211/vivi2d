import { LIPSYNC_DEFAULTS } from "@vivi2d/core/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectViseme, LipSyncAnalyser, smoothVolume } from "@/lib/lipsync-engine";

// ============================================================
// smoothVolume
// ============================================================

describe("smoothVolume", () => {
  it("スムージング 0 では入力値をそのまま返す", () => {
    expect(smoothVolume(0.8, 0.2, 0)).toBe(0.8);
  });

  it("スムージング 1 では前回の値を返す", () => {
    expect(smoothVolume(0.8, 0.2, 1)).toBe(0.2);
  });

  it("中間のスムージング値で補間する", () => {
    const result = smoothVolume(1.0, 0.0, 0.5);
    expect(result).toBeCloseTo(0.5);
  });

  it("同じ値なら変化しない", () => {
    expect(smoothVolume(0.5, 0.5, 0.7)).toBe(0.5);
  });

  it("連続適用で目標値に収束する", () => {
    let smoothed = 0;
    for (let i = 0; i < 100; i++) {
      smoothed = smoothVolume(1.0, smoothed, 0.9);
    }
    expect(smoothed).toBeGreaterThan(0.95);
  });
});

// ============================================================
// LipSyncAnalyser
// ============================================================

describe("LipSyncAnalyser", () => {
  let analyser: LipSyncAnalyser;

  beforeEach(() => {
    analyser = new LipSyncAnalyser();
  });

  it("初期状態では接続されていない", () => {
    expect(analyser.isConnected).toBe(false);
  });

  it("未接続時の getRmsVolume は 0 を返す", () => {
    expect(analyser.getRmsVolume()).toBe(0);
  });

  it("connectMicrophone でマイクに接続できる", async () => {
    await analyser.connectMicrophone();
    expect(analyser.isConnected).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("connectMicrophone 後に getRmsVolume が動作する", async () => {
    await analyser.connectMicrophone();
    expect(analyser.getRmsVolume()).toBe(0);
  });

  it("getRmsVolume returns 0 for silence", async () => {
    await analyser.connectMicrophone();
    expect(analyser.getRmsVolume()).toBe(0);
  });

  it("getRmsVolume で音量がある場合はゼロより大きい値を返す", async () => {
    await analyser.connectMicrophone();

    const mockCtx = (AudioContext as any).mock.results[0].value;
    const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;
    mockAnalyser.getFloatTimeDomainData.mockImplementation((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = 0.5;
      }
    });

    const volume = analyser.getRmsVolume();
    expect(volume).toBeGreaterThan(0);
  });

  it("getRmsVolume の結果は [0, 1] の範囲内", async () => {
    await analyser.connectMicrophone();

    const mockCtx = (AudioContext as any).mock.results[0].value;
    const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;
    mockAnalyser.getFloatTimeDomainData.mockImplementation((arr: Float32Array) => {
      arr.fill(1.0);
    });

    const volume = analyser.getRmsVolume();
    expect(volume).toBeGreaterThanOrEqual(0);
    expect(volume).toBeLessThanOrEqual(1);
  });

  it("threshold 以下の音量は 0 になる", async () => {
    await analyser.connectMicrophone();

    const mockCtx = (AudioContext as any).mock.results[0].value;
    const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;
    mockAnalyser.getFloatTimeDomainData.mockImplementation((arr: Float32Array) => {
      arr.fill(0.001);
    });

    const volume = analyser.getRmsVolume(LIPSYNC_DEFAULTS.GAIN, 0.01);
    expect(volume).toBe(0);
  });

  it("gain でボリュームを増幅できる", async () => {
    await analyser.connectMicrophone();

    const mockCtx = (AudioContext as any).mock.results[0].value;
    const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;
    mockAnalyser.getFloatTimeDomainData.mockImplementation((arr: Float32Array) => {
      arr.fill(0.3);
    });

    const lowGain = analyser.getRmsVolume(1.0, 0);
    const highGain = analyser.getRmsVolume(5.0, 0);
    expect(highGain).toBeGreaterThanOrEqual(lowGain);
  });

  it("dispose でリソースを解放する", async () => {
    await analyser.connectMicrophone();
    expect(analyser.isConnected).toBe(true);
    analyser.dispose();
    expect(analyser.isConnected).toBe(false);
  });

  it("dispose 後の getRmsVolume は 0 を返す", async () => {
    await analyser.connectMicrophone();
    analyser.dispose();
    expect(analyser.getRmsVolume()).toBe(0);
  });

  it("connectMicrophone を2回呼ぶと前の接続を解放する", async () => {
    await analyser.connectMicrophone();
    const firstCtx = (AudioContext as any).mock.results[0].value;
    await analyser.connectMicrophone();
    expect(firstCtx.close).toHaveBeenCalled();
  });

  it("connectAudioFile でオーディオバッファを接続できる", async () => {
    await analyser.connectAudioFile(new ArrayBuffer(0));
    expect(analyser.isConnected).toBe(true);
  });

  it("未接続時の dispose はエラーにならない", () => {
    expect(() => analyser.dispose()).not.toThrow();
  });

  it("AudioBufferSourceNode の stop が失敗しても dispose が完了する", async () => {
    await analyser.connectAudioFile(new ArrayBuffer(0));

    const mockCtx = (AudioContext as any).mock.results.at(-1).value;
    const mockSource = mockCtx.createBufferSource.mock.results[0].value;
    mockSource.stop.mockImplementation(() => {
      throw new Error("Already stopped");
    });

    expect(() => analyser.dispose()).not.toThrow();
    expect(analyser.isConnected).toBe(false);
  });

  describe("getFrequencyBands", () => {
    it("未接続時はゼロを返す", () => {
      const bands = analyser.getFrequencyBands();
      expect(bands).toEqual({ low: 0, mid: 0, high: 0 });
    });

    it("接続後に帯域エネルギーを返す", async () => {
      await analyser.connectMicrophone();

      const mockCtx = (AudioContext as any).mock.results.at(-1).value;
      const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;

      mockAnalyser.getByteFrequencyData = vi.fn((arr: Uint8Array) => {
        arr.fill(128);
      });

      const bands = analyser.getFrequencyBands();
      expect(bands.low).toBeGreaterThan(0);
      expect(bands.mid).toBeGreaterThan(0);
      expect(bands.high).toBeGreaterThan(0);
    });

    it("低域のみにエネルギーがある場合", async () => {
      await analyser.connectMicrophone();

      const mockCtx = (AudioContext as any).mock.results.at(-1).value;
      const mockAnalyser = mockCtx.createAnalyser.mock.results[0].value;
      const sampleRate = 44100;
      const binWidth = sampleRate / (mockAnalyser.frequencyBinCount * 2);
      const lowEnd = Math.floor(500 / binWidth);

      mockAnalyser.getByteFrequencyData = vi.fn((arr: Uint8Array) => {
        arr.fill(0);
        for (let i = 0; i < lowEnd && i < arr.length; i++) {
          arr[i] = 200;
        }
      });

      const bands = analyser.getFrequencyBands();
      expect(bands.low).toBeGreaterThan(bands.mid);
      expect(bands.low).toBeGreaterThan(bands.high);
    });
  });
});

// ============================================================
// detectViseme
// ============================================================

describe("detectViseme", () => {
  it("無音では sil を返す", () => {
    const result = detectViseme({ low: 0, mid: 0, high: 0 });
    expect(result.viseme).toBe("sil");
    expect(result.confidence).toBe(1);
  });

  it("閾値未満の合計では sil を返す", () => {
    const result = detectViseme({ low: 0.01, mid: 0.01, high: 0.01 }, 0.05);
    expect(result.viseme).toBe("sil");
  });

  it("高域優位（>0.65）で ss を返す", () => {
    const result = detectViseme({ low: 0.05, mid: 0.1, high: 0.85 });
    expect(result.viseme).toBe("ss");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("高域優位（0.5-0.65）で ff を返す", () => {
    const result = detectViseme({ low: 0.15, mid: 0.25, high: 0.55 });
    expect(result.viseme).toBe("ff");
  });

  it("低域強い（>0.7）で aa を返す", () => {
    const result = detectViseme({ low: 0.8, mid: 0.1, high: 0.1 });
    expect(result.viseme).toBe("aa");
  });

  it("低域優位 + 中域ありで oh を返す", () => {
    const result = detectViseme({ low: 0.55, mid: 0.25, high: 0.1 });
    expect(result.viseme).toBe("oh");
  });

  it("低域優位 + 中域少で ou を返す", () => {
    const result = detectViseme({ low: 0.6, mid: 0.1, high: 0.2 });
    expect(result.viseme).toBe("ou");
  });

  it("中域優位 + mid>0.3 で eh を返す", () => {
    const result = detectViseme({ low: 0.15, mid: 0.55, high: 0.2 });
    expect(result.viseme).toBe("eh");
  });

  it("中域優位 + mid<=0.3 で ih を返す", () => {
    const result = detectViseme({ low: 0.2, mid: 0.28, high: 0.12 });
    expect(result.viseme).toBe("ih");
  });

  it("low+mid バランス + 合計>0.3 で pp を返す", () => {
    const result = detectViseme({ low: 0.2, mid: 0.2, high: 0.15 });
    expect(result.viseme).toBe("pp");
  });

  it("low+mid バランス + 合計<=0.3 で kk を返す", () => {
    const result = detectViseme({ low: 0.1, mid: 0.1, high: 0.05 });
    expect(result.viseme).toBe("kk");
  });

  it("どのパターンにも当てはまらない場合 nn を返す", () => {
    const result = detectViseme({ low: 0.08, mid: 0.08, high: 0.13 });
    expect(result.viseme).toBe("nn");
    expect(result.confidence).toBeCloseTo(0.4);
  });
});
