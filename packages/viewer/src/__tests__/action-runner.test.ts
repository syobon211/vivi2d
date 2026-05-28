import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRUSTED_VIVI_ACTION_SCOPES,
  getActionRequiredScope,
  parseViviAction,
} from "../actions/action-types";
import { exportActions, importActions } from "../actions/action-persistence";
import { ViviActionRegistry } from "../actions/action-registry";
import { ViviActionRunner } from "../actions/action-runner";

function createScopedRunner(
  capabilities: ConstructorParameters<typeof ViviActionRunner>[0] = {},
  options: ConstructorParameters<typeof ViviActionRunner>[1] = {},
): ViviActionRunner {
  return new ViviActionRunner(capabilities, {
    scopes: TRUSTED_VIVI_ACTION_SCOPES,
    ...options,
  });
}

describe("ViviActionRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs expression preset actions through capabilities", async () => {
    const applyExpressionPreset = vi.fn();
    const runner = createScopedRunner({ applyExpressionPreset });

    const event = await runner.runAction(
      {
        id: "preset-smile",
        name: "Smile",
        kind: "expressionPreset",
        enabled: true,
        payload: { presetId: "smile" },
      },
      { triggerSource: "keyboard" },
    );

    expect(applyExpressionPreset).toHaveBeenCalledWith("smile");
    expect(event.status).toBe("completed");
    expect(runner.getEvents().map((e) => e.status)).toEqual([
      "started",
      "completed",
    ]);
  });

  it("runs every non-script viewer operation through the matching capability", async () => {
    const capabilities = {
      setParameters: vi.fn(),
      getParameters: vi.fn(() => ({})),
      applyExpressionPreset: vi.fn(),
      setModelTransform: vi.fn(),
      setPropTransform: vi.fn(),
      setPropVisible: vi.fn(),
      cycleProps: vi.fn(),
      spawnPropBurst: vi.fn(),
      playEffectPreset: vi.fn(),
      setRecording: vi.fn().mockResolvedValue(undefined),
      runBridgeCommand: vi.fn().mockResolvedValue(undefined),
      applyCalibrationProfile: vi.fn(),
      captureCalibrationNeutral: vi.fn(),
      resetCalibration: vi.fn(),
    };
    const runner = createScopedRunner(capabilities);

    const actions = [
      {
        id: "model-transform",
        name: "Model transform",
        kind: "modelTransform",
        payload: { x: 10, y: -4, scale: 1.2, rotation: 8 },
      },
      {
        id: "prop-transform",
        name: "Prop transform",
        kind: "propTransform",
        payload: {
          propId: "hat",
          transform: { x: 2, y: 3, scaleX: 1.1, scaleY: 0.9, opacity: 0.8 },
        },
      },
      {
        id: "prop-visible",
        name: "Prop visible",
        kind: "propVisibility",
        payload: { propId: "hat", visible: false },
      },
      {
        id: "prop-cycle",
        name: "Prop cycle",
        kind: "propCycle",
        payload: { groupId: "poses", direction: "previous" },
      },
      {
        id: "prop-burst",
        name: "Prop burst",
        kind: "propSpawnBurst",
        payload: { propIds: ["star", "heart"] },
      },
      {
        id: "recording",
        name: "Recording",
        kind: "recordingControl",
        payload: { state: "toggle" },
      },
      {
        id: "bridge",
        name: "Bridge",
        kind: "bridgeCommand",
        payload: {
          bridgeId: "scene",
          commandId: "setSourceVisible",
          args: { sceneName: "Main", sourceName: "Avatar", visible: true },
        },
      },
      {
        id: "calibration-apply",
        name: "Calibration apply",
        kind: "calibrationProfileApply",
        payload: { profileId: "stable" },
      },
      {
        id: "calibration-neutral",
        name: "Calibration neutral",
        kind: "calibrationCaptureNeutral",
        payload: { source: "face" },
      },
      {
        id: "calibration-reset",
        name: "Calibration reset",
        kind: "calibrationReset",
        payload: { profileId: "stable" },
      },
    ] as const;

    for (const action of actions) {
      const event = await runner.runAction({
        ...action,
        enabled: true,
      });
      expect(event.status).toBe("completed");
    }

    expect(capabilities.setModelTransform).toHaveBeenCalledWith({
      x: 10,
      y: -4,
      scale: 1.2,
      rotation: 8,
    });
    expect(capabilities.setPropTransform).toHaveBeenCalledWith("hat", {
      x: 2,
      y: 3,
      scaleX: 1.1,
      scaleY: 0.9,
      opacity: 0.8,
    });
    expect(capabilities.setPropVisible).toHaveBeenCalledWith("hat", false);
    expect(capabilities.cycleProps).toHaveBeenCalledWith("poses", "previous");
    expect(capabilities.spawnPropBurst).toHaveBeenCalledWith(["star", "heart"]);
    expect(capabilities.setRecording).toHaveBeenCalledWith("toggle");
    expect(capabilities.runBridgeCommand).toHaveBeenCalledWith("scene", "setSourceVisible", {
      sceneName: "Main",
      sourceName: "Avatar",
      visible: true,
    });
    expect(capabilities.applyCalibrationProfile).toHaveBeenCalledWith("stable");
    expect(capabilities.captureCalibrationNeutral).toHaveBeenCalledWith("face");
    expect(capabilities.resetCalibration).toHaveBeenCalledWith("stable");
  });

  it("clamps action access by validating payload schemas", async () => {
    const runner = createScopedRunner({
      setParameters: vi.fn(),
    });

    const event = await runner.runAction({
      id: "bad-parameter",
      name: "Bad parameter",
      kind: "signalSet",
      enabled: true,
      payload: { values: { ParamX: Number.NaN } },
    });

    expect(event.status).toBe("failed");
  });

  it("reports capability failures as bounded failed events", async () => {
    const runner = createScopedRunner({
      setPropTransform: vi.fn(() => {
        throw new Error("prop store unavailable");
      }),
    });

    const event = await runner.runAction({
      id: "prop-transform",
      name: "Prop transform",
      kind: "propTransform",
      enabled: true,
      payload: {
        propId: "hat",
        transform: { x: 4 },
      },
    });

    expect(event.status).toBe("failed");
    expect(event.error).toBe("prop store unavailable");
    expect(runner.getEvents().map((e) => e.status)).toEqual([
      "started",
      "failed",
    ]);
  });

  it("rejects raw bridge command passthrough payloads", () => {
    expect(() =>
      parseViviAction({
        id: "raw-bridge",
        name: "Raw bridge",
        kind: "bridgeCommand",
        enabled: true,
        payload: {
          bridgeId: "scene",
          commandId: "rawWebsocketCall",
          args: { method: "SetCurrentProgramScene" },
        },
      }),
    ).toThrow();
  });

  it("skips disabled actions", async () => {
    const runner = createScopedRunner({
      playEffectPreset: vi.fn(),
    });

    const event = await runner.runAction({
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: false,
      payload: { effectId: "stars" },
    });

    expect(event.status).toBe("skipped");
  });

  it("honors cooldowns deterministically", async () => {
    const playEffectPreset = vi.fn();
    const runner = createScopedRunner({ playEffectPreset });
    const action = {
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: true,
      cooldownMs: 60_000,
      payload: { effectId: "hearts" },
    };

    const first = await runner.runAction(action);
    const second = await runner.runAction(action);

    expect(first.status).toBe("completed");
    expect(second.status).toBe("skipped");
    expect(playEffectPreset).toHaveBeenCalledTimes(1);
  });

  it("drops duplicate running actions when queue policy is drop", async () => {
    let release!: () => void;
    const setRecording = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const runner = createScopedRunner({ setRecording });
    const action = {
      id: "recording",
      name: "Recording",
      kind: "recordingControl",
      enabled: true,
      queuePolicy: "drop",
      payload: { state: "toggle" },
    } as const;

    const first = runner.runAction(action);
    await Promise.resolve();
    const second = await runner.runAction(action);
    release();

    expect((await first).status).toBe("completed");
    expect(second.status).toBe("skipped");
    expect(setRecording).toHaveBeenCalledTimes(1);
  });

  it("serializes queued actions and preserves pending tail order", async () => {
    const releases: Array<() => void> = [];
    const setRecording = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const runner = createScopedRunner({ setRecording });
    const action = {
      id: "recording",
      name: "Recording",
      kind: "recordingControl",
      enabled: true,
      queuePolicy: "enqueue",
      payload: { state: "toggle" },
    } as const;

    const first = runner.runAction(action);
    await Promise.resolve();
    const second = runner.runAction(action);
    const third = runner.runAction(action);
    expect(setRecording).toHaveBeenCalledTimes(1);

    releases.shift()?.();
    await expect(first).resolves.toMatchObject({ status: "completed" });
    expect(setRecording).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await expect(second).resolves.toMatchObject({ status: "completed" });
    expect(setRecording).toHaveBeenCalledTimes(3);
    releases.shift()?.();
    await expect(third).resolves.toMatchObject({ status: "completed" });
  });

  it("lets the newest replace action win after the previous action settles", async () => {
    let releaseFirst!: () => void;
    const setRecording = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const runner = createScopedRunner({ setRecording });
    const action = {
      id: "recording",
      name: "Recording",
      kind: "recordingControl",
      enabled: true,
      queuePolicy: "replace",
      payload: { state: "toggle" },
    } as const;

    const first = runner.runAction(action);
    await Promise.resolve();
    const replaced = runner.runAction(action);
    const newest = runner.runAction(action);
    releaseFirst();

    await expect(first).resolves.toMatchObject({ status: "completed" });
    await expect(replaced).resolves.toMatchObject({ status: "skipped" });
    await expect(newest).resolves.toMatchObject({ status: "completed" });
    expect(setRecording).toHaveBeenCalledTimes(2);
  });

  it("maps action kinds to explicit scopes", () => {
    expect(getActionRequiredScope("signalSet")).toBe("write:signals");
    expect(getActionRequiredScope("signalPulse")).toBe("write:signals");
    expect(getActionRequiredScope("effectPreset")).toBe("run:actions:safe");
    expect(getActionRequiredScope("propTransform")).toBe("write:props");
    expect(getActionRequiredScope("recordingControl")).toBe(
      "run:actions:recording",
    );
    expect(getActionRequiredScope("scriptCommand")).toBe("run:actions:script");
    expect(getActionRequiredScope("bridgeCommand")).toBe("bridge:scene");
    expect(getActionRequiredScope("calibrationReset")).toBe("write:calibration");
  });

  it("fails closed when a direct runner has no explicit scopes", async () => {
    const playEffectPreset = vi.fn();
    const runner = new ViviActionRunner({ playEffectPreset });

    const event = await runner.runAction({
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: true,
      payload: { effectId: "stars" },
    });

    expect(event.status).toBe("failed");
    expect(event.error).toBe("Action scope denied");
    expect(playEffectPreset).not.toHaveBeenCalled();
  });

  it("denies actions when the required scope is missing", async () => {
    const runner = new ViviActionRunner(
      { setParameters: vi.fn() },
      { scopes: ["run:actions:safe"] },
    );

    const event = await runner.runAction({
      id: "param",
      name: "Parameter",
      kind: "signalSet",
      enabled: true,
      payload: { values: { ParamX: 1 } },
    });

    expect(event.status).toBe("failed");
  });

  it("runs parameter pulses as temporary writes with deterministic restore", async () => {
    vi.useFakeTimers();
    const current: Record<string, number> = { ParamX: 0.25 };
    const setParameters = vi.fn((values: Record<string, number>) => {
      Object.assign(current, values);
    });
    const getParameters = vi.fn((ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, current[id]])),
    );
    const runner = createScopedRunner({ getParameters, setParameters });

    const eventPromise = runner.runAction({
      id: "pulse",
      name: "Pulse",
      kind: "signalPulse",
      enabled: true,
      payload: { values: { ParamX: 1 }, durationMs: 50, restore: true },
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(current.ParamX).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    const event = await eventPromise;

    expect(event.status).toBe("completed");
    expect(getParameters).toHaveBeenCalledWith(["ParamX"]);
    expect(setParameters).toHaveBeenNthCalledWith(1, { ParamX: 1 });
    expect(setParameters).toHaveBeenNthCalledWith(2, { ParamX: 0.25 });
    expect(current.ParamX).toBe(0.25);
  });

  it("supports pulses that intentionally do not restore previous values", async () => {
    const setParameters = vi.fn();
    const getParameters = vi.fn();
    const runner = createScopedRunner({ getParameters, setParameters });

    const event = await runner.runAction({
      id: "pulse-no-restore",
      name: "Pulse without restore",
      kind: "signalPulse",
      enabled: true,
      payload: { values: { ParamX: 1 }, restore: false },
    });

    expect(event.status).toBe("completed");
    expect(getParameters).not.toHaveBeenCalled();
    expect(setParameters).toHaveBeenCalledTimes(1);
  });

  it("keeps valid trigger sources observable", async () => {
    const runner = createScopedRunner({ playEffectPreset: vi.fn() });

    await runner.runAction(
      {
        id: "effect",
        name: "Effect",
        kind: "effectPreset",
        enabled: true,
        payload: { effectId: "stars" },
      },
      { triggerSource: "ui", trustedTriggerSource: true },
    );

    expect(runner.getEvents()[0]?.triggerSource).toBe("ui");
  });

  it("drops untrusted trigger source labels from audit events", async () => {
    const runner = createScopedRunner({ playEffectPreset: vi.fn() });

    await runner.runAction(
      {
        id: "effect",
        name: "Effect",
        kind: "effectPreset",
        enabled: true,
        payload: { effectId: "stars" },
      },
      { triggerSource: "ui", trustedTriggerSource: false },
    );

    expect(runner.getEvents()[0]?.triggerSource).toBeUndefined();
  });

  it("keeps only a bounded event history", async () => {
    const runner = createScopedRunner(
      { playEffectPreset: vi.fn() },
      { eventLimit: 16 },
    );

    for (let i = 0; i < 20; i += 1) {
      await runner.runAction({
        id: `effect-${i}`,
        name: "Effect",
        kind: "effectPreset",
        enabled: true,
        payload: { effectId: "stars" },
      });
    }

    expect(runner.getEvents()).toHaveLength(16);
  });

  it("can clear recorded action events without affecting later execution", async () => {
    const playEffectPreset = vi.fn();
    const runner = createScopedRunner({ playEffectPreset });

    await runner.runAction({
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: true,
      payload: { effectId: "stars" },
    });
    expect(runner.getEvents()).not.toHaveLength(0);

    runner.clearEvents();
    expect(runner.getEvents()).toEqual([]);

    const event = await runner.runAction({
      id: "effect-2",
      name: "Effect 2",
      kind: "effectPreset",
      enabled: true,
      payload: { effectId: "sparkles" },
    });
    expect(event.status).toBe("completed");
    expect(playEffectPreset).toHaveBeenLastCalledWith("sparkles");
  });
});

describe("ViviActionRegistry", () => {
  it("registers and lists validated actions", () => {
    const registry = new ViviActionRegistry();
    registry.register({
      id: "preset-smile",
      name: "Smile",
      kind: "expressionPreset",
      enabled: true,
      payload: { presetId: "smile" },
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.get("preset-smile")?.name).toBe("Smile");
  });
});

describe("action persistence", () => {
  it("round-trips exported safe actions with optional triggers", () => {
    const exported = exportActions(
      [
        {
          id: "effect",
          name: "Effect",
          kind: "effectPreset",
          enabled: true,
          payload: { effectId: "hearts" },
        },
      ],
      [
        {
          id: "keyboard-trigger",
          actionId: "effect",
          source: "keyboard",
          match: { key: "H", ctrlKey: true },
          enabled: true,
        },
        {
          id: "api-trigger",
          actionId: "effect",
          source: "viewerApi",
          match: {},
          enabled: true,
        },
      ],
    );

    const imported = importActions(exported);

    expect(imported?.actions).toHaveLength(1);
    expect(imported?.triggers.map((trigger) => trigger.id)).toEqual([
      "keyboard-trigger",
      "api-trigger",
    ]);
  });

  it("treats missing or invalid trigger blocks as an empty trigger list", () => {
    const action = {
      id: "effect",
      name: "Effect",
      kind: "effectPreset",
      enabled: true,
      payload: { effectId: "sparkles" },
    };

    expect(
      importActions(JSON.stringify({ version: 1, actions: [action] }))?.triggers,
    ).toEqual([]);
    expect(
      importActions(
        JSON.stringify({ version: 1, actions: [action], triggers: "not-array" }),
      )?.triggers,
    ).toEqual([]);
  });

  it("rejects malformed action export envelopes before importing actions", () => {
    expect(importActions("{not json")).toBeNull();
    expect(importActions(JSON.stringify({ version: 2, actions: [] }))).toBeNull();
    expect(
      importActions(
        JSON.stringify({
          version: 1,
          actions: Array.from({ length: 257 }, (_, index) => ({
            id: `effect-${index}`,
            name: "Effect",
            kind: "effectPreset",
            enabled: true,
            payload: { effectId: "stars" },
          })),
        }),
      ),
    ).toBeNull();
  });

  it("rejects imported bridge actions", () => {
    const result = importActions(
      JSON.stringify({
        version: 1,
        actions: [
          {
            id: "bridge",
            name: "Bridge",
            kind: "bridgeCommand",
            enabled: true,
            payload: {
              bridgeId: "scene",
              commandId: "activateScene",
              args: { sceneName: "Scene2" },
            },
          },
        ],
      }),
    );

    expect(result).toBeNull();
  });

  it("requires explicit review for imported scripts", async () => {
    expect(
      importActions(
        JSON.stringify({
          version: 1,
          actions: [
            {
              id: "script",
              name: "Script",
              kind: "scriptCommand",
              enabled: true,
              payload: { script: "set ParamX 1" },
            },
          ],
        }),
      ),
    ).toBeNull();

    expect(
      importActions(
        JSON.stringify({
          version: 1,
          actions: [
            {
              id: "script",
              name: "Script",
              kind: "scriptCommand",
              enabled: true,
              payload: { script: "set ParamX 1" },
            },
          ],
        }),
        { reviewedScriptActionIds: new Set(["other-script"]) },
      ),
    ).toBeNull();

    const reviewed = importActions(
      JSON.stringify({
        version: 1,
        actions: [
          {
            id: "script",
            name: "Script",
            kind: "scriptCommand",
            enabled: true,
            payload: { script: "set ParamX 1" },
          },
        ],
      }),
      { reviewedScriptActionIds: new Set(["script"]) },
    );

    expect(reviewed?.actions).toHaveLength(1);
    expect(reviewed?.actions[0]?.source).toBe("user");

    const runScript = vi.fn();
    const runner = createScopedRunner({ runScript });
    const event = await runner.runAction(reviewed!.actions[0]);

    expect(event.status).toBe("completed");
    expect(runScript).toHaveBeenCalledWith("set ParamX 1");
  });

  it("lets reviewed imported calibration actions execute as user actions", async () => {
    const reviewed = importActions(
      JSON.stringify({
        version: 1,
        actions: [
          {
            id: "calibrate",
            name: "Calibrate",
            kind: "calibrationProfileApply",
            enabled: true,
            payload: { profileId: "stable" },
          },
        ],
      }),
      { reviewedCalibrationActionIds: new Set(["calibrate"]) },
    );
    const applyCalibrationProfile = vi.fn();
    const runner = createScopedRunner({ applyCalibrationProfile });

    const event = await runner.runAction(reviewed!.actions[0]);

    expect(reviewed?.actions[0]?.source).toBe("user");
    expect(event.status).toBe("completed");
    expect(applyCalibrationProfile).toHaveBeenCalledWith("stable");
  });

  it("parses valid actions directly", () => {
    expect(
      parseViviAction({
        id: "effect",
        name: "Effect",
        kind: "effectPreset",
        enabled: true,
        payload: { effectId: "confetti" },
      }).kind,
    ).toBe("effectPreset");
  });
});
