import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LipSyncAnalyser, vowelToMouthParams } from "../tracking/lipsync-analyser";


function createMockAudioContext() {
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 1024,
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      arr.fill(0);
    }),
    getFloatFrequencyData: vi.fn((arr: Float32Array) => {
      arr.fill(-100);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const stream = {
    getTracks: () => [{ stop: vi.fn() }],
  };

  const context = {
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
    close: vi.fn().mockResolvedValue(undefined),
    sampleRate: 48000,
  };

  return { context, analyser, source, stream };
}

describe("LipSyncAnalyser", () => {
  let mocks: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    mocks = createMockAudioContext();

    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser = mocks.context.createAnalyser;
        createMediaStreamSource = mocks.context.createMediaStreamSource;
        close = mocks.context.close;
        sampleRate = mocks.context.sampleRate;
      },
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mocks.stream),
      },
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((_cb: () => void) => {
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("init()でAudioContextとAnalyserNodeが作成される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();
    expect(mocks.context.createAnalyser).toHaveBeenCalled();
    expect(mocks.context.createMediaStreamSource).toHaveBeenCalled();
    analyser.destroy();
  });

  it("init('rms')でRMSモードが設定される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init("rms");
    expect(analyser.currentMode).toBe("rms");
    analyser.destroy();
  });

  it("init('viseme')でビゼームモードが設定される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init("viseme");
    expect(analyser.currentMode).toBe("viseme");
    analyser.destroy();
  });

  it("start()でコールバックが設定されanimationFrameが登録される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    const callback = vi.fn();
    analyser.start(callback);

    expect(requestAnimationFrame).toHaveBeenCalled();
    analyser.destroy();
  });

  it("stop()でcancelAnimationFrameが呼ばれる", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();
    analyser.start(vi.fn());
    analyser.stop();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("destroy()で全リソースが破棄される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();
    analyser.start(vi.fn());
    analyser.destroy();

    expect(mocks.source.disconnect).toHaveBeenCalled();
    expect(mocks.analyser.disconnect).toHaveBeenCalled();
    expect(mocks.context.close).toHaveBeenCalled();
  });

  it("無音時のRMS計算でvolume=0が返される", async () => {
    const analyser = new LipSyncAnalyser();
    await analyser.init();

    let capturedVolume = -1;
    analyser.start((vol) => {
      capturedVolume = vol;
    });

    const rafCb = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    if (rafCb) rafCb();

    expect(capturedVolume).toBe(0);
    analyser.destroy();
  });

  it("大きな信号でvolume>0が返される", async () => {
    mocks.analyser.getFloatTimeDomainData = vi.fn((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 0.5;
    });

    const analyser = new LipSyncAnalyser();
    await analyser.init();

    let capturedVolume = -1;
    analyser.start((vol) => {
      capturedVolume = vol;
    });

    const rafCb = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    if (rafCb) rafCb();

    expect(capturedVolume).toBeGreaterThan(0);
    analyser.destroy();
  });

  it("ビゼームモードではvowelパラメータが返される", async () => {
    mocks.analyser.getFloatTimeDomainData = vi.fn((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 0.3;
    });
    mocks.analyser.getFloatFrequencyData = vi.fn((arr: Float32Array) => {
      arr.fill(-100);
      const binFreq = 48000 / (1024 * 2);
      const f1Bin = Math.round(700 / binFreq);
      const f2Bin = Math.round(1200 / binFreq);
      if (f1Bin < arr.length) arr[f1Bin] = -10;
      if (f2Bin < arr.length) arr[f2Bin] = -20;
    });

    const analyser = new LipSyncAnalyser();
    await analyser.init("viseme");

    let capturedVowel: string | undefined;
    analyser.start((_vol, vowel) => {
      capturedVowel = vowel;
    });

    const rafCb = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    if (rafCb) rafCb();

    expect(capturedVowel).toBeDefined();
    expect(["a", "i", "u", "e", "o"]).toContain(capturedVowel);
    analyser.destroy();
  });

  it("RMSモードではvowelがundefinedで返される", async () => {
    mocks.analyser.getFloatTimeDomainData = vi.fn((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 0.3;
    });

    const analyser = new LipSyncAnalyser();
    await analyser.init("rms");

    let capturedVowel: string | undefined = "should-be-undefined";
    analyser.start((_vol, vowel) => {
      capturedVowel = vowel;
    });

    const rafCb = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    if (rafCb) rafCb();

    expect(capturedVowel).toBeUndefined();
    analyser.destroy();
  });
});

describe("vowelToMouthParams", () => {
  it("'a'は口を大きく開く", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("a", 1);
    expect(mouthOpen).toBeGreaterThan(0.5);
    expect(mouthForm).toBeCloseTo(0.5, 1);
  });

  it("'i'は口を横に引く", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("i", 1);
    expect(mouthOpen).toBeLessThan(0.5);
    expect(mouthForm).toBeGreaterThan(0.7);
  });

  it("'u'は口をすぼめる", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("u", 1);
    expect(mouthOpen).toBeLessThan(0.5);
    expect(mouthForm).toBeLessThan(0.3);
  });

  it("'e'は口を中開きで横引き", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("e", 1);
    expect(mouthOpen).toBeGreaterThan(0.3);
    expect(mouthForm).toBeGreaterThan(0.6);
  });

  it("'o'は口を丸く開く", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("o", 1);
    expect(mouthOpen).toBeGreaterThan(0.3);
    expect(mouthForm).toBeLessThan(0.4);
  });

  it("'silent'は口を閉じる", () => {
    const { mouthOpen, mouthForm } = vowelToMouthParams("silent", 0);
    expect(mouthOpen).toBe(0);
    expect(mouthForm).toBe(0.5);
  });

  it("volume=0で全母音のmouthOpen=0", () => {
    for (const v of ["a", "i", "u", "e", "o"] as const) {
      expect(vowelToMouthParams(v, 0).mouthOpen).toBe(0);
    }
  });
});


describe("母音分類の全分岐テスト（FFTピークパターン別）", () => {
  const SAMPLE_RATE = 48000;
  const BIN_COUNT = 1024;
  const BIN_FREQ = SAMPLE_RATE / (BIN_COUNT * 2);

  function createFreqDataMock(f1Hz: number, f2Hz: number) {
    return vi.fn((arr: Float32Array) => {
      arr.fill(-100);
      const f1Bin = Math.round(f1Hz / BIN_FREQ);
      const f2Bin = Math.round(f2Hz / BIN_FREQ);
      if (f1Bin < arr.length) arr[f1Bin] = -10;
      if (f2Bin < arr.length) arr[f2Bin] = -20;
    });
  }

  function createLoudTimeDomainMock() {
    return vi.fn((arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 0.4;
    });
  }

  function createMockAudioContextForVowel(f1Hz: number, f2Hz: number) {
    const analyser = {
      fftSize: 0,
      frequencyBinCount: BIN_COUNT,
      getFloatTimeDomainData: createLoudTimeDomainMock(),
      getFloatFrequencyData: createFreqDataMock(f1Hz, f2Hz),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
    };

    const context = {
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
      close: vi.fn().mockResolvedValue(undefined),
      sampleRate: SAMPLE_RATE,
    };

    return { context, analyser, source, stream };
  }

  async function getVowelForFormants(
    f1Hz: number,
    f2Hz: number,
  ): Promise<string | undefined> {
    const mocks = createMockAudioContextForVowel(f1Hz, f2Hz);

    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser = mocks.context.createAnalyser;
        createMediaStreamSource = mocks.context.createMediaStreamSource;
        close = mocks.context.close;
        sampleRate = mocks.context.sampleRate;
      },
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mocks.stream),
      },
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((_cb: () => void) => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const analyser = new LipSyncAnalyser();
    await analyser.init("viseme");

    let capturedVowel: string | undefined;
    analyser.start((_vol, vowel) => {
      capturedVowel = vowel;
    });

    const rafCb = (requestAnimationFrame as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    if (rafCb) rafCb();

    analyser.destroy();
    return capturedVowel;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("F1=700Hz, F2=1250Hz → 'a' に分類される（F1>500, F2が1200-1600の中間帯域）", async () => {
    const vowel = await getVowelForFormants(700, 1250);
    expect(vowel).toBe("a");
  });

  it("F1=300Hz, F2=2200Hz → 'i' に分類される（F2>1600, F1<400）", async () => {
    const vowel = await getVowelForFormants(300, 2200);
    expect(vowel).toBe("i");
  });

  it("F1=450Hz, F2=1900Hz → 'e' に分類される（F2>1600, F1>=400）", async () => {
    const vowel = await getVowelForFormants(450, 1900);
    expect(vowel).toBe("e");
  });

  it("F1=300Hz, F2=800Hz → 'u' に分類される（F2<1200, F1<400）", async () => {
    const vowel = await getVowelForFormants(300, 800);
    expect(vowel).toBe("u");
  });

  it("F1=500Hz, F2=900Hz → 'o' に分類される（F2<1200, F1>=400）", async () => {
    const vowel = await getVowelForFormants(500, 900);
    expect(vowel).toBe("o");
  });

  it("F1=350Hz, F2=1400Hz → 'o' に分類される（F2が中間帯域, F1<=500, フォールバック）", async () => {
    const vowel = await getVowelForFormants(350, 1400);
    expect(vowel).toBe("o");
  });
});
