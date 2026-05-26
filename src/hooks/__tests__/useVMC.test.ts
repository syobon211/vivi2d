
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useParameterStore } from "@/stores/parameterStore";
import { useVMCStore } from "@/stores/vmcStore";
import { setupProjectWithParameters } from "@/test/helpers";
import { useVMC } from "../useVMC";

describe("useVMC", () => {
  beforeEach(() => {
    setupProjectWithParameters([
      { id: "p1", name: "目X", min: -1, max: 1, defaultValue: 0 },
      { id: "p2", name: "目Y", min: -1, max: 1, defaultValue: 0 },
    ]);
    useVMCStore.getState().reset();
  });

  afterEach(() => {
    useVMCStore.getState().reset();
  });

  it("フックが正常にマウントされる", () => {
    const { unmount } = renderHook(() => useVMC());
    unmount();
  });

  it("接続状態でバッファ更新するとパラメータに反映される", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.7 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    expect(paramValues.p1).toBeCloseTo(0.7);
  });

  it("未接続時はパラメータに反映されない", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.9 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    expect(paramValues.p1).toBe(0);
  });

  it("マッピングが空の場合はパラメータを更新しない", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.5 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    expect(paramValues.p1).toBe(0);
    expect(paramValues.p2).toBe(0);
  });

  it("scale と offset がパラメータ値に反映される", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 2, offset: 0.1 });
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.3 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    // 0.3 * 2 + 0.1 = 0.7
    expect(paramValues.p1).toBeCloseTo(0.7);
  });

  it("バッファに存在しないマッピング名は無視される", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "Missing", parameterId: "p1", scale: 1, offset: 0 });
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.5 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    expect(paramValues.p1).toBe(0);
  });

  it("複数マッピングが同時に反映される", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });
    vmcStore.addMapping({ vmcName: "EyeY", parameterId: "p2", scale: 1, offset: 0 });
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.3, EyeY: 0.8 });
    });

    await new Promise((r) => setTimeout(r, 50));

    const paramValues = useParameterStore.getState().parameterValues;
    expect(paramValues.p1).toBeCloseTo(0.3);
    expect(paramValues.p2).toBeCloseTo(0.8);
  });

  it("同じバッファ参照で更新されない場合はスキップされる", async () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });
    vmcStore.setConnected(true);

    renderHook(() => useVMC());

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.5 });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(useParameterStore.getState().parameterValues.p1).toBeCloseTo(0.5);

    const currentBuffer = useVMCStore.getState().faceChannelBuffer;
    act(() => {
      useVMCStore.setState({ faceChannelBuffer: currentBuffer });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(useParameterStore.getState().parameterValues.p1).toBeCloseTo(0.5);
  });

  it("アンマウント時にサブスクリプションが解除される", () => {
    const vmcStore = useVMCStore.getState();
    vmcStore.setConnected(true);
    vmcStore.addMapping({ vmcName: "EyeX", parameterId: "p1", scale: 1, offset: 0 });

    const { unmount } = renderHook(() => useVMC());
    unmount();

    act(() => {
      useVMCStore.getState().updateFaceChannelBuffer({ EyeX: 0.99 });
    });

    expect(useParameterStore.getState().parameterValues.p1).toBe(0);
  });
});
