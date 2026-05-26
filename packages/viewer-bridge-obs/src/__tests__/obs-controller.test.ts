import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OBS_CONFIG, OBSController } from "../obs-controller";

const obsMocks = vi.hoisted(() => {
  const instances: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
  }> = [];

  const factory = vi.fn().mockImplementation(function MockOBSWebSocket() {
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      call: vi.fn().mockImplementation((method: string) => {
        if (method === "GetSceneList") {
          return {
            scenes: [
              { sceneName: "Scene1", sceneIndex: 0 },
              { sceneName: "Scene2", sceneIndex: 1 },
            ],
          };
        }
        if (method === "GetCurrentProgramScene") {
          return { currentProgramSceneName: "Scene1" };
        }
        if (method === "GetSceneItemId") {
          return { sceneItemId: 42 };
        }
        return {};
      }),
    };
    instances.push(instance);
    return instance;
  });

  return { factory, instances };
});

vi.mock("obs-websocket-js", () => ({
  default: obsMocks.factory,
}));

describe("OBSController optional bridge adapter", () => {
  beforeEach(() => {
    obsMocks.instances.length = 0;
    vi.clearAllMocks();
  });

  it("starts disconnected with the default local endpoint", () => {
    const controller = new OBSController();

    expect(controller.isConnected()).toBe(false);
    expect(DEFAULT_OBS_CONFIG).toEqual({
      url: "ws://127.0.0.1:4455",
      password: undefined,
    });
  });

  it("rejects non-local plain websocket bridge URLs", () => {
    expect(
      () =>
        new OBSController({
          url: "ws://192.0.2.10:4455",
        }),
    ).toThrow("must use wss:// for non-local hosts");
  });

  it("allows secure remote bridge URLs", () => {
    const controller = new OBSController({
      url: "wss://bridge.example.test:4455",
    });

    expect(controller.isConnected()).toBe(false);
  });

  it("rejects bridge URLs with embedded credentials", () => {
    expect(
      () =>
        new OBSController({
          url: "ws://user:pass@127.0.0.1:4455",
        }),
    ).toThrow("must not include embedded credentials");
  });

  it("connects, disconnects, and exposes connection state", async () => {
    const controller = new OBSController();

    await controller.connect();
    expect(controller.isConnected()).toBe(true);

    await controller.disconnect();
    expect(controller.isConnected()).toBe(false);
  });

  it("returns scene data only while connected", async () => {
    const controller = new OBSController();

    await expect(controller.getScenes()).resolves.toEqual([]);
    await expect(controller.getCurrentScene()).resolves.toBeNull();

    await controller.connect();

    await expect(controller.getScenes()).resolves.toEqual([
      { sceneName: "Scene1", sceneIndex: 0 },
      { sceneName: "Scene2", sceneIndex: 1 },
    ]);
    await expect(controller.getCurrentScene()).resolves.toBe("Scene1");
  });

  it("drops malformed scene records from bridge responses", async () => {
    const controller = new OBSController();
    await controller.connect();
    obsMocks.instances[0]!.call.mockImplementation((method: string) => {
      if (method === "GetSceneList") {
        return {
          scenes: [
            { sceneName: "Scene1", sceneIndex: 0 },
            { sceneName: 123, sceneIndex: 1 },
            { sceneName: "SceneBad", sceneIndex: Number.NaN },
          ],
        };
      }
      return {};
    });

    await expect(controller.getScenes()).resolves.toEqual([
      { sceneName: "Scene1", sceneIndex: 0 },
    ]);
  });

  it("executes scene and source visibility commands through code-defined methods", async () => {
    const controller = new OBSController();
    await controller.connect();

    await controller.setScene("Scene2");
    await expect(
      controller.setSourceVisible("Scene1", "Camera", true),
    ).resolves.toBe(true);

    const instance = obsMocks.instances[0]!;
    expect(instance.call).toHaveBeenCalledWith("SetCurrentProgramScene", {
      sceneName: "Scene2",
    });
    expect(instance.call).toHaveBeenCalledWith("SetSceneItemEnabled", {
      sceneName: "Scene1",
      sceneItemId: 42,
      sceneItemEnabled: true,
    });
  });

  it("does not issue scene-changing websocket calls while disconnected", async () => {
    const controller = new OBSController();

    await controller.setScene("Scene2");
    await expect(
      controller.setSourceVisible("Scene1", "Camera", true),
    ).resolves.toBe(false);

    expect(obsMocks.instances[0]!.call).not.toHaveBeenCalled();
  });

  it("reports source visibility failure when a source cannot be resolved", async () => {
    const controller = new OBSController();
    await controller.connect();
    obsMocks.instances[0]!.call.mockImplementation((method: string) => {
      if (method === "GetSceneItemId") {
        return { sceneItemId: null };
      }
      return {};
    });

    await expect(
      controller.setSourceVisible("Scene1", "Missing", true),
    ).resolves.toBe(false);
    expect(obsMocks.instances[0]!.call).not.toHaveBeenCalledWith(
      "SetSceneItemEnabled",
      expect.anything(),
    );
  });

  it("supports preset-to-scene mappings without exposing raw websocket calls", async () => {
    const controller = new OBSController();
    await controller.connect();
    controller.setPresetMappings([{ presetName: "Smile", sceneName: "Scene2" }]);

    expect(controller.getPresetMappings()).toEqual([
      { presetName: "Smile", sceneName: "Scene2" },
    ]);
    await controller.onPresetApplied("Smile");

    expect(obsMocks.instances[0]!.call).toHaveBeenCalledWith(
      "SetCurrentProgramScene",
      { sceneName: "Scene2" },
    );
  });

  it("wraps connection failures and resets state", async () => {
    const controller = new OBSController();
    obsMocks.instances[0]!.connect.mockRejectedValueOnce(new Error("refused"));

    await expect(controller.connect()).rejects.toThrow(
      "OBS connection failed: refused",
    );
    expect(controller.isConnected()).toBe(false);
  });

  it("cleans up websocket listeners and disconnects on destroy", async () => {
    const controller = new OBSController();
    const instance = obsMocks.instances[0]!;
    await controller.connect();
    const closedHandler = instance.on.mock.calls.find(
      ([event]) => event === "ConnectionClosed",
    )?.[1];
    const errorHandler = instance.on.mock.calls.find(
      ([event]) => event === "ConnectionError",
    )?.[1];

    controller.destroy();

    expect(instance.off).toHaveBeenCalledWith("ConnectionClosed", closedHandler);
    expect(instance.off).toHaveBeenCalledWith("ConnectionError", errorHandler);
    await Promise.resolve();
    expect(instance.disconnect).toHaveBeenCalled();
    expect(controller.isConnected()).toBe(false);
  });

  it("drops the connected state when OBS reports connection loss", async () => {
    const controller = new OBSController();
    const instance = obsMocks.instances[0]!;
    await controller.connect();

    const closedHandler = instance.on.mock.calls.find(
      ([event]) => event === "ConnectionClosed",
    )?.[1] as (() => void) | undefined;
    closedHandler?.();

    expect(controller.isConnected()).toBe(false);

    await controller.connect();
    const errorHandler = instance.on.mock.calls.find(
      ([event]) => event === "ConnectionError",
    )?.[1] as (() => void) | undefined;
    errorHandler?.();

    expect(controller.isConnected()).toBe(false);
  });

  it("returns false when ping cannot connect", async () => {
    const controller = new OBSController();
    const existingInstance = obsMocks.instances[0]!;
    obsMocks.factory.mockImplementationOnce(function MockPingOBSWebSocket() {
      const instance = {
        connect: vi.fn().mockRejectedValueOnce(new Error("offline")),
        disconnect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
        call: vi.fn(),
      };
      obsMocks.instances.push(instance);
      return instance;
    });

    await expect(controller.ping()).resolves.toBe(false);
    expect(existingInstance.disconnect).not.toHaveBeenCalled();
  });

  it("times out slow connection attempts", async () => {
    vi.useFakeTimers();
    const controller = new OBSController({ connectTimeoutMs: 1_000 });
    obsMocks.instances[0]!.connect.mockImplementationOnce(
      () => new Promise(() => {}),
    );

    const expectation = expect(controller.connect()).rejects.toThrow(
      "OBS connection failed",
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(controller.isConnected()).toBe(false);
    vi.useRealTimers();
  });
});
