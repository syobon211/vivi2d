import { describe, expect, it, vi } from "vitest";
import { ViviViewerController } from "../controller/viewer-controller";
import {
  VIVI_TRACKING_CALIBRATION_VERSION,
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
} from "../calibration/calibration-types";

function createImageProp(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "Prop",
    kind: "image",
    visible: true,
    drawOrder: 0,
    opacity: 1,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    source: {
      kind: "inlineBase64",
      mimeType: "image/png",
      bytes: "AAAA",
      portable: true,
    },
    ...overrides,
  };
}

describe("ViviViewerController", () => {
  it("owns action execution and emits controller events", async () => {
    const setParameters = vi.fn();
    const controller = new ViviViewerController({
      actionCapabilities: {
        setParameters,
      },
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = await controller.dispatch({
      type: "action.run",
      action: {
        id: "set-mouth",
        name: "Set Mouth",
        kind: "signalSet",
        enabled: true,
        payload: { values: { mouthOpen: 1 } },
      },
      options: { scopes: ["write:signals"] },
    });

    expect(result.accepted).toBe(true);
    expect(setParameters).toHaveBeenCalledWith({ mouthOpen: 1 });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "viewer.action.event" }),
    );
    expect(controller.snapshot().actionEvents.at(-1)).toMatchObject({
      actionId: "set-mouth",
      status: "completed",
    });
    expect(controller.snapshot().actionEvents.at(-1)?.triggerSource).toBeUndefined();
  });

  it("routes prop and calibration commands through one snapshot boundary", async () => {
    const controller = new ViviViewerController();
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.dispatch({
      type: "props.add",
      scopes: ["write:props"],
      prop: {
        id: "hat",
        name: "Hat",
        kind: "image",
        visible: false,
        drawOrder: 0,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "AAAA",
          portable: true,
        },
      },
    });

    await controller.dispatch({
      type: "props.setVisible",
      propId: "hat",
      visible: true,
      scopes: ["write:props"],
    });
    await controller.dispatch({
      type: "calibration.importConfig",
      scopes: ["write:calibration"],
      config: {
        version: VIVI_TRACKING_CALIBRATION_VERSION,
        activeProfileId: "test",
        profiles: [
          {
            version: VIVI_TRACKING_CALIBRATION_VERSION,
            id: "test",
            name: "Test",
            channels: {
              "face.mouthOpen": {
                ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
                inputMin: 0,
                inputMax: 1,
              },
            },
          },
        ],
      },
    });

    const snapshot = controller.snapshot();
    expect(snapshot.props[0]).toMatchObject({ id: "hat", visible: true });
    expect(snapshot.calibration.activeProfileId).toBe("test");
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "viewer.prop.event",
        event: "added",
        propId: "hat",
      }),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "viewer.prop.event",
        event: "updated",
        propId: "hat",
      }),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "viewer.calibration.changed" }),
    );
  });

  it("routes finite parameter patches through the controller boundary", async () => {
    const setParameters = vi.fn();
    const listener = vi.fn();
    const controller = new ViviViewerController({
      actionCapabilities: { setParameters },
    });
    controller.subscribe(listener);

    const result = await controller.dispatch({
      type: "signals.set",
      values: { ParamX: 1, ParamBad: Number.NaN },
      scopes: ["write:signals"],
      source: "tracking",
    });

    expect(result.accepted).toBe(true);
    expect(setParameters).toHaveBeenCalledWith({ ParamX: 1 });
    expect(listener).toHaveBeenCalledWith({
      type: "viewer.signals.changed",
      source: "tracking",
      signalIds: ["ParamX"],
    });
  });

  it("rejects direct parameter writes without the write scope", async () => {
    const setParameters = vi.fn();
    const controller = new ViviViewerController({
      actionCapabilities: { setParameters },
    });

    const result = await controller.dispatch({
      type: "signals.set",
      values: { ParamX: 1 },
      scopes: ["run:actions:safe"],
      source: "script",
    });

    expect(result).toEqual({
      accepted: false,
      reason: "signal scope denied",
    });
    expect(setParameters).not.toHaveBeenCalled();
  });

  it("rejects privileged controller commands without narrow write scopes", async () => {
    const controller = new ViviViewerController();
    await controller.dispatch({
      type: "props.add",
      scopes: ["write:props"],
      prop: {
        id: "hat",
        name: "Hat",
        kind: "image",
        visible: false,
        drawOrder: 0,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        source: {
          kind: "inlineBase64",
          mimeType: "image/png",
          bytes: "AAAA",
          portable: true,
        },
      },
    });

    await expect(
      controller.dispatch({
        type: "props.setVisible",
        propId: "hat",
        visible: true,
        scopes: ["run:actions:safe"],
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop scope denied" });

    await expect(
      controller.dispatch({
        type: "calibration.reset",
        scopes: ["run:actions:safe"],
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "calibration scope denied",
    });
  });

  it("requires prop ids at the controller boundary before adding props", async () => {
    const controller = new ViviViewerController();

    await expect(
      controller.dispatch({
        type: "props.add",
        scopes: ["write:props"],
        prop: {
          name: "Missing ID",
          kind: "image",
          visible: true,
          drawOrder: 0,
          opacity: 1,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          source: {
            kind: "inlineBase64",
            mimeType: "image/png",
            bytes: "AAAA",
            portable: true,
          },
        },
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop id required" });
  });

  it("rejects action dispatch without explicit scopes", async () => {
    const setParameters = vi.fn();
    const controller = new ViviViewerController({
      actionCapabilities: { setParameters },
    });

    const result = await controller.dispatch({
      type: "action.run",
      action: {
        id: "set-mouth",
        name: "Set Mouth",
        kind: "signalSet",
        enabled: true,
        payload: { values: { mouthOpen: 1 } },
      },
    });

    expect(result).toEqual({ accepted: false, reason: "action scope denied" });
    expect(setParameters).not.toHaveBeenCalled();
  });

  it("rejects oversized direct parameter patches instead of truncating", async () => {
    const setParameters = vi.fn();
    const controller = new ViviViewerController({
      actionCapabilities: { setParameters },
    });
    const values = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`Param${index}`, index]),
    );

    const result = await controller.dispatch({
      type: "signals.set",
      values,
      scopes: ["write:signals"],
    });

    expect(result).toEqual({
      accepted: false,
      reason: "too many signal values",
    });
    expect(setParameters).not.toHaveBeenCalled();
  });

  it("fails closed for malformed prop mutations and missing targets", async () => {
    const controller = new ViviViewerController();

    await expect(
      controller.dispatch({
        type: "props.add",
        scopes: ["write:props"],
        prop: createImageProp("hat"),
      }),
    ).resolves.toEqual({ accepted: true });
    await expect(
      controller.dispatch({
        type: "props.add",
        scopes: ["write:props"],
        prop: createImageProp("hat"),
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop already exists" });
    await expect(
      controller.dispatch({
        type: "props.update",
        scopes: ["write:props"],
        prop: createImageProp("missing"),
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop not found" });
    await expect(
      controller.dispatch({
        type: "props.update",
        scopes: ["write:props"],
        prop: createImageProp("hat", { opacity: Number.NaN }),
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid prop" });
    await expect(
      controller.dispatch({
        type: "props.patchTransform",
        scopes: ["write:props"],
        propId: "hat",
        transform: { scaleX: 0 },
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "invalid prop transform",
    });
    await expect(
      controller.dispatch({
        type: "props.patchTransform",
        scopes: ["write:props"],
        propId: "missing",
        transform: { x: 1 },
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop not found" });
    await expect(
      controller.dispatch({
        type: "props.remove",
        scopes: ["write:props"],
        propId: "",
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid prop id" });
    await expect(
      controller.dispatch({
        type: "props.remove",
        scopes: ["write:props"],
        propId: "missing",
      }),
    ).resolves.toEqual({ accepted: false, reason: "prop not found" });
  });

  it("validates grouped prop operations before applying them", async () => {
    const controller = new ViviViewerController();
    await controller.dispatch({
      type: "props.add",
      scopes: ["write:props"],
      prop: createImageProp("hat", { groupId: "hats" }),
    });

    await expect(
      controller.dispatch({
        type: "props.cycleGroup",
        scopes: ["write:props"],
        groupId: "",
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid prop group" });
    await expect(
      controller.dispatch({
        type: "props.spawnBurst",
        scopes: ["write:props"],
        propIds: Array.from({ length: 17 }, (_, index) => `prop-${index}`),
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid prop burst" });
    await expect(
      controller.dispatch({
        type: "props.spawnBurst",
        scopes: ["write:props"],
        propIds: [""],
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid prop burst" });
    await expect(
      controller.dispatch({
        type: "props.cycleGroup",
        scopes: ["write:props"],
        groupId: "hats",
        direction: "previous",
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it("fails closed for calibration and signal commands without valid state", async () => {
    const controller = new ViviViewerController();

    await expect(
      controller.dispatch({
        type: "signals.set",
        values: { ParamX: 1 },
        scopes: ["write:signals"],
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "signal writer not available",
    });

    const signalController = new ViviViewerController({
      actionCapabilities: { setParameters: vi.fn() },
    });
    await expect(
      signalController.dispatch({
        type: "signals.set",
        values: { ParamX: Number.NaN },
        scopes: ["write:signals"],
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "no finite signal values",
    });

    await expect(
      controller.dispatch({
        type: "calibration.applyProfile",
        scopes: ["write:calibration"],
        profileId: "missing",
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "calibration profile not found",
    });
    await expect(
      controller.dispatch({
        type: "calibration.captureNeutral",
        scopes: ["write:calibration"],
        source: "face",
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "no calibration frame recorded",
    });
    await expect(
      controller.dispatch({
        type: "calibration.suggestRanges",
        scopes: ["write:calibration"],
        source: "face",
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "no observed calibration range",
    });
    await expect(
      controller.dispatch({
        type: "calibration.captureNeutral",
        scopes: ["write:calibration"],
        source: "bad-source" as never,
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "invalid calibration source",
    });
    await expect(
      controller.dispatch({
        type: "calibration.importConfig",
        scopes: ["write:calibration"],
        config: { version: 0, activeProfileId: "", profiles: [] } as never,
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "invalid calibration config",
    });
    await expect(
      controller.dispatch({
        type: "calibration.reset",
        scopes: ["write:calibration"],
        profileId: "",
      }),
    ).resolves.toEqual({
      accepted: false,
      reason: "invalid calibration reset",
    });
  });

  it("isolates listener failures so later listeners still receive events", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new ViviViewerController();
    const healthy = vi.fn();
    controller.subscribe(() => {
      throw new Error("listener exploded");
    });
    controller.subscribe(healthy);

    await controller.dispatch({
      type: "props.add",
      scopes: ["write:props"],
      prop: createImageProp("hat"),
    });

    expect(warn).toHaveBeenCalledWith(
      "[viewer-controller] listener failed",
      expect.any(Error),
    );
    expect(healthy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "viewer.prop.event" }),
    );
    warn.mockRestore();
  });
});
