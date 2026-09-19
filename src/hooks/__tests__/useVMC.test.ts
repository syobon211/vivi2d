import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParameterStore } from "@/stores/parameterStore";
import { useVMCStore } from "@/stores/vmcStore";
import { setupProjectWithParameters } from "@/test/helpers";
import { useVMC } from "../useVMC";

const pending = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
function flushFrame() {
  const callbacks = [...pending.values()];
  pending.clear();
  act(() => {
    for (const callback of callbacks) callback(16);
  });
}

describe("useVMC", () => {
  beforeEach(() => {
    setupProjectWithParameters([
      { id: "p1", name: "目X", min: -1, max: 1, defaultValue: 0 },
      { id: "p2", name: "目Y", min: -1, max: 1, defaultValue: 0 },
      { id: "untouched", name: "保持対象", min: -1, max: 1, defaultValue: 0.9 },
    ]);
    useVMCStore.getState().reset();
    pending.clear();
    nextFrame = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        pending.set(++nextFrame, callback);
        return nextFrame;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => pending.delete(id)),
    );
  });
  afterEach(() => {
    useVMCStore.getState().reset();
    pending.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("最新bufferを1frameに集約し、実mapping更新と未対象parameter保持を確認する", () => {
    const vmc = useVMCStore.getState();
    vmc.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 2, offset: 0.1 });
    vmc.addMapping({ vmcName: "EyeY", parameterId: "p2", scale: 0.5, offset: -0.2 });
    vmc.addMapping({ vmcName: "Missing", parameterId: "untouched", scale: 9, offset: 9 });
    vmc.setConnected(true);
    const write = vi.spyOn(useParameterStore.getState(), "setAllValues");
    const { unmount } = renderHook(() => useVMC());
    act(() => {
      vmc.updateFaceChannelBuffer({ EyeX: 0.1, EyeY: 0.2 });
      vmc.updateFaceChannelBuffer({ EyeX: 0.3, EyeY: 0.8 });
    });
    expect(pending.size).toBe(1);
    expect(write).not.toHaveBeenCalled();
    flushFrame();
    expect(write).toHaveBeenCalledTimes(1);
    expect(useParameterStore.getState().parameterValues.p1).toBeCloseTo(0.7);
    expect(useParameterStore.getState().parameterValues.p2).toBeCloseTo(0.2);
    expect(useParameterStore.getState().parameterValues.untouched).toBe(0.9);

    const buffer = useVMCStore.getState().faceChannelBuffer;
    act(() => useVMCStore.setState({ faceChannelBuffer: buffer }));
    expect(pending.size).toBe(0);
    flushFrame();
    expect(write).toHaveBeenCalledTimes(1);

    act(() => {
      vmc.updateMapping(0, { scale: 3, offset: -0.25 });
      vmc.updateFaceChannelBuffer({ EyeX: 0.25 });
    });
    flushFrame();
    expect(write).toHaveBeenCalledTimes(2);
    expect(useParameterStore.getState().parameterValues).toEqual({
      p1: 0.5,
      p2: 0.2,
      untouched: 0.9,
    });
    unmount();
  });

  it.each([
    "disconnected",
    "no-mappings",
    "missing-channel",
  ] as const)("%sではparameterを書き換えない", (mode) => {
    const vmc = useVMCStore.getState();
    if (mode !== "no-mappings") {
      vmc.addMapping({
        vmcName: mode === "missing-channel" ? "Missing" : "EyeX",
        parameterId: "p1",
        scale: 1,
        offset: 0,
      });
    }
    vmc.setConnected(mode !== "disconnected");
    const before = useParameterStore.getState().parameterValues;
    const write = vi.spyOn(useParameterStore.getState(), "setAllValues");
    const { unmount } = renderHook(() => useVMC());
    act(() => vmc.updateFaceChannelBuffer({ EyeX: 0.9 }));
    flushFrame();
    expect(write).not.toHaveBeenCalled();
    expect(useParameterStore.getState().parameterValues).toBe(before);
    unmount();
  });

  it("unmountは保留中RAFを取り消し、その後のbufferも購読しない", () => {
    const vmc = useVMCStore.getState();
    vmc.setConnected(true);
    vmc.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });
    const write = vi.spyOn(useParameterStore.getState(), "setAllValues");
    const { unmount } = renderHook(() => useVMC());
    act(() => vmc.updateFaceChannelBuffer({ EyeX: 0.7 }));
    const queued = [...pending.keys()];
    expect(queued).toHaveLength(1);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(queued[0]);
    expect(pending.size).toBe(0);
    act(() => vmc.updateFaceChannelBuffer({ EyeX: 0.99 }));
    expect(pending.size).toBe(0);
    flushFrame();
    expect(write).not.toHaveBeenCalled();
    expect(useParameterStore.getState().parameterValues.p1).toBe(0);
  });
});
