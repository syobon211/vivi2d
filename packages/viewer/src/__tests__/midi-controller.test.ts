import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiController, midiLearn } from "../tracking/midi-controller";


function createMockInput(id = "input-1", name = "MIDI Keyboard") {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    id,
    name,
    manufacturer: "Test",
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners.get(type)?.delete(handler);
    }),
    _fire(data: Uint8Array) {
      const event = { data } as unknown as Event;
      for (const handler of listeners.get("midimessage") ?? []) {
        handler(event);
      }
    },
    _listeners: listeners,
  };
}

function createMockAccess(inputs: ReturnType<typeof createMockInput>[]) {
  const stateListeners = new Set<EventListener>();
  return {
    inputs: new Map(inputs.map((inp) => [inp.id, inp])),
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      if (type === "statechange") stateListeners.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      if (type === "statechange") stateListeners.delete(handler);
    }),
    _stateListeners: stateListeners,
  } as unknown as MIDIAccess;
}

describe("MidiController", () => {
  let _originalNavigator: Navigator;

  beforeEach(() => {
    _originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isSupported()はrequestMIDIAccessがあればtrueを返す", () => {
    vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn() });
    expect(MidiController.isSupported()).toBe(true);
  });

  it("isSupported()はrequestMIDIAccessがなければfalseを返す", () => {
    vi.stubGlobal("navigator", {});
    expect(MidiController.isSupported()).toBe(false);
  });

  it("init()でrequestMIDIAccessが呼ばれる", async () => {
    const mockAccess = createMockAccess([]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    expect(navigator.requestMIDIAccess).toHaveBeenCalled();
    midi.destroy();
  });

  it("getInputDevices()はデバイス一覧を返す", async () => {
    const input = createMockInput("dev-1", "My MIDI Pad");
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    const devices = midi.getInputDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.name).toBe("My MIDI Pad");
    midi.destroy();
  });

  it("init()前のgetInputDevices()は空を返す", () => {
    const midi = new MidiController();
    expect(midi.getInputDevices()).toHaveLength(0);
  });

  it("CCメッセージがマッピングに従ってパラメータに変換される", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 7, parameterId: "ParamVolume" }]);

    const callback = vi.fn();
    midi.start(callback);

    input._fire(new Uint8Array([0xb0, 7, 64]));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ParamVolume: expect.closeTo(64 / 127, 2) }),
    );

    midi.destroy();
  });

  it("マッチしないCC番号は無視される", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 7, parameterId: "ParamVolume" }]);

    const callback = vi.fn();
    midi.start(callback);

    input._fire(new Uint8Array([0xb0, 1, 100]));
    expect(callback).not.toHaveBeenCalled();

    midi.destroy();
  });

  it("チャンネルフィルタリングが動作する", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 1, parameterId: "P", channel: 0 }]);

    const callback = vi.fn();
    midi.start(callback);

    input._fire(new Uint8Array([0xb1, 1, 100]));
    expect(callback).not.toHaveBeenCalled();

    input._fire(new Uint8Array([0xb0, 1, 100]));
    expect(callback).toHaveBeenCalled();

    midi.destroy();
  });

  it("min/maxレンジスケーリングが動作する", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 1, parameterId: "P", min: -1, max: 1 }]);

    const callback = vi.fn();
    midi.start(callback);

    input._fire(new Uint8Array([0xb0, 1, 0]));
    expect(callback).toHaveBeenCalledWith({ P: -1 });

    callback.mockClear();
    input._fire(new Uint8Array([0xb0, 1, 127]));
    expect(callback).toHaveBeenCalledWith({ P: 1 });

    midi.destroy();
  });

  it("Non-CCメッセージ（ノートオン等）は無視される", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 1, parameterId: "P" }]);

    const callback = vi.fn();
    midi.start(callback);

    // Note On (0x90)
    input._fire(new Uint8Array([0x90, 60, 127]));
    expect(callback).not.toHaveBeenCalled();

    midi.destroy();
  });

  it("stop()でリスナーが除去される", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.start(vi.fn());
    midi.stop();

    expect(input.removeEventListener).toHaveBeenCalled();
  });

  it("短すぎるメッセージ（2byte以下）は無視される", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 1, parameterId: "P" }]);

    const callback = vi.fn();
    midi.start(callback);

    input._fire(new Uint8Array([0xb0, 1]));
    expect(callback).not.toHaveBeenCalled();

    midi.destroy();
  });
});

describe("midiLearn", () => {
  it("最初のCCメッセージのチャンネルとCC番号を返す", async () => {
    const input = createMockInput();
    const access = createMockAccess([input]);

    const promise = midiLearn(access, 5000);

    input._fire(new Uint8Array([0xb2, 11, 100]));

    const result = await promise;
    expect(result).toEqual({ channel: 2, cc: 11 });
  });

  it("タイムアウト時にnullを返す", async () => {
    const input = createMockInput();
    const access = createMockAccess([input]);

    vi.useFakeTimers();
    const promise = midiLearn(access, 100);
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});

describe("MidiController 追加カバレッジ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("init()でWeb MIDI API未対応の場合はエラーをスローする", async () => {
    vi.stubGlobal("navigator", {});

    const midi = new MidiController();
    await expect(midi.init()).rejects.toThrow("Web MIDI API is not available");
  });

  it("statechangeイベントで新しい入力デバイスにリスナーが付与される", async () => {
    const input1 = createMockInput("input-1", "Keyboard");
    const mockAccess = createMockAccess([input1]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 7, parameterId: "ParamVolume" }]);

    const callback = vi.fn();
    midi.start(callback);

    const input2 = createMockInput("input-2", "Fader");
    (mockAccess as unknown as { inputs: Map<string, unknown> }).inputs.set(
      "input-2",
      input2,
    );

    for (const handler of (
      mockAccess as unknown as { _stateListeners: Set<EventListener> }
    )._stateListeners) {
      handler(new Event("statechange"));
    }

    input2._fire(new Uint8Array([0xb0, 7, 127]));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ParamVolume: expect.closeTo(1, 2) }),
    );

    midi.destroy();
  });

  it("start()をinit()前に呼ぶとエラーをスローする", () => {
    const midi = new MidiController();
    expect(() => midi.start(vi.fn())).toThrow("Call init() first");
  });

  it("destroy()でaccessとmappingsがクリアされる", async () => {
    const input = createMockInput();
    const mockAccess = createMockAccess([input]);
    vi.stubGlobal("navigator", {
      requestMIDIAccess: vi.fn().mockResolvedValue(mockAccess),
    });

    const midi = new MidiController();
    await midi.init();
    midi.setMappings([{ cc: 1, parameterId: "P" }]);
    midi.start(vi.fn());

    midi.destroy();

    expect(midi.getInputDevices()).toHaveLength(0);

    expect(() => midi.start(vi.fn())).toThrow("Call init() first");
  });
});
