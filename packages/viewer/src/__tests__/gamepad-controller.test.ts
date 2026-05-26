import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GAMEPAD_AXIS_NAMES,
  GAMEPAD_BUTTON_NAMES,
  GamepadController,
  getConnectedGamepads,
} from "../tracking/gamepad-controller";


function createMockGamepad(overrides: Partial<Gamepad> = {}): Gamepad {
  return {
    id: "Xbox Controller",
    index: 0,
    connected: true,
    timestamp: 0,
    mapping: "standard",
    axes: [0.5, -0.3, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: i === 6,
      touched: false,
      value: i === 6 ? 0.8 : 0,
    })),
    hapticActuators: [],
    vibrationActuator: null as unknown as GamepadHapticActuator,
    ...overrides,
  } as unknown as Gamepad;
}

describe("定数", () => {
  it("GAMEPAD_AXIS_NAMESが4項目ある", () => {
    expect(GAMEPAD_AXIS_NAMES).toHaveLength(4);
  });

  it("GAMEPAD_BUTTON_NAMESが16項目ある", () => {
    expect(GAMEPAD_BUTTON_NAMES).toHaveLength(16);
  });
});

describe("GamepadController", () => {
  let rafCallbacks: Array<() => void>;

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: () => void) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hasGamepad()はゲームパッド未接続でfalseを返す", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });
    expect(GamepadController.hasGamepad()).toBe(false);
  });

  it("hasGamepad()はゲームパッド接続時にtrueを返す", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [createMockGamepad(), null, null, null],
    });
    expect(GamepadController.hasGamepad()).toBe(true);
  });

  it("start()でポーリングが開始されコールバックが呼ばれる", () => {
    const gp = createMockGamepad();
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "axis", index: 0, parameterId: "ParamX" }]);

    const callback = vi.fn();
    ctrl.start(callback);

    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ParamX: 0.5 }));

    ctrl.destroy();
  });

  it("デッドゾーン以下の値は0になる", () => {
    const gp = createMockGamepad({ axes: [0.05, 0, 0, 0] });
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "axis", index: 0, parameterId: "ParamX", deadzone: 0.1 }]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamX: 0 });
    ctrl.destroy();
  });

  it("scaleが適用される", () => {
    const gp = createMockGamepad({ axes: [0.5, 0, 0, 0] });
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([
      { type: "axis", index: 0, parameterId: "ParamX", scale: 2.0, deadzone: 0 },
    ]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamX: 1.0 });
    ctrl.destroy();
  });

  it("ボタン値がマッピングされる", () => {
    const gp = createMockGamepad();
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "button", index: 6, parameterId: "ParamLT" }]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamLT: 0.8 });
    ctrl.destroy();
  });

  it("stop()でポーリングが停止する", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([]);
    ctrl.start(vi.fn());
    ctrl.stop();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("destroy()でリソースがクリーンアップされる", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "axis", index: 0, parameterId: "P" }]);
    ctrl.start(vi.fn());
    ctrl.destroy();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("ゲームパッド未接続時はコールバックが呼ばれない", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "axis", index: 0, parameterId: "P" }]);
    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).not.toHaveBeenCalled();
    ctrl.destroy();
  });

  it("stop()で既に停止済み（animFrameId=0）ならcancelAnimationFrameが呼ばれない", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.stop();

    expect(cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it("軸インデックスが利用可能な範囲外の場合は値が0にフォールバックする", () => {
    const gp = createMockGamepad({ axes: [0.5, -0.3, 0, 0] });
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([
      { type: "axis", index: 5, parameterId: "ParamExtra", deadzone: 0, scale: 1 },
    ]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamExtra: 0 });
    ctrl.destroy();
  });

  it("ボタンインデックスが利用可能な範囲外の場合は値が0になる", () => {
    const gp = createMockGamepad();
    vi.stubGlobal("navigator", {
      getGamepads: () => [gp, null, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "button", index: 20, parameterId: "ParamBtn20" }]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamBtn20: 0 });
    ctrl.destroy();
  });

  it("最初のスロットがnullの場合、2番目のゲームパッドにフォールバックする", () => {
    const gp2 = createMockGamepad({ index: 1, axes: [0.9, 0, 0, 0] });
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, gp2, null, null],
    });

    const ctrl = new GamepadController();
    ctrl.setMappings([{ type: "axis", index: 0, parameterId: "ParamX", deadzone: 0 }]);

    const callback = vi.fn();
    ctrl.start(callback);
    if (rafCallbacks.length > 0) rafCallbacks[0]!();

    expect(callback).toHaveBeenCalledWith({ ParamX: 0.9 });
    ctrl.destroy();
  });
});

describe("getConnectedGamepads", () => {
  it("接続中のゲームパッドのみ返す", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        createMockGamepad({ index: 0, id: "Pad A" }),
        null,
        createMockGamepad({ index: 2, id: "Pad B" }),
        null,
      ],
    });

    const result = getConnectedGamepads();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ index: 0, id: "Pad A" });
    expect(result[1]).toEqual({ index: 2, id: "Pad B" });
  });

  it("未接続なら空配列を返す", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [null, null, null, null],
    });
    expect(getConnectedGamepads()).toHaveLength(0);
  });
});
