import { isDefaultFormActive } from "@vivi2d/core/default-form-lock";
import type { ProjectData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";
import { resetAllStores } from "@/test/store-reset";

describe("デフォルトフォームロック統合", () => {
  beforeEach(() => {
    resetAllStores();
  });

  function setupProject(): void {
    const project: ProjectData = {
      name: "test",
      width: 100,
      height: 100,
      layers: [],
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders: [],
      stateMachines: [],
    };
    useEditorStore.setState({ project });
    useParameterStore.setState({ parameterValues: { p1: 0, p2: 0 } });
  }

  it("ロック無効時は常に false", () => {
    setupProject();
    useViewportStore.setState({ defaultFormLocked: false });

    const { project } = useEditorStore.getState();
    const { parameterValues } = useParameterStore.getState();
    const { defaultFormLocked } = useViewportStore.getState();

    expect(defaultFormLocked).toBe(false);
    expect(
      defaultFormLocked && isDefaultFormActive(project!.parameters, parameterValues),
    ).toBe(false);
  });

  it("ロック有効 + デフォルト値 → 編集ブロック", () => {
    setupProject();
    useViewportStore.setState({ defaultFormLocked: true });

    const { project } = useEditorStore.getState();
    const { parameterValues } = useParameterStore.getState();
    const { defaultFormLocked } = useViewportStore.getState();

    expect(defaultFormLocked).toBe(true);
    expect(isDefaultFormActive(project!.parameters, parameterValues)).toBe(true);
  });

  it("ロック有効 + パラメータ変更済み → 編集許可", () => {
    setupProject();
    useViewportStore.setState({ defaultFormLocked: true });
    useParameterStore.getState().setParameterValue("p1", 10);

    const { project } = useEditorStore.getState();
    const { parameterValues } = useParameterStore.getState();

    expect(isDefaultFormActive(project!.parameters, parameterValues)).toBe(false);
  });

  it("toggleDefaultFormLock でロック状態が切り替わる", () => {
    expect(useViewportStore.getState().defaultFormLocked).toBe(false);
    useViewportStore.getState().toggleDefaultFormLock();
    expect(useViewportStore.getState().defaultFormLocked).toBe(true);
    useViewportStore.getState().toggleDefaultFormLock();
    expect(useViewportStore.getState().defaultFormLocked).toBe(false);
  });
});


import { renderHook } from "@testing-library/react";
import { useDefaultFormLock } from "../useDefaultFormLock";

describe("useDefaultFormLock フック", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("ロック無効時は false を返す", () => {
    useViewportStore.setState({ defaultFormLocked: false });
    const { result } = renderHook(() => useDefaultFormLock());
    expect(result.current).toBe(false);
  });

  it("ロック有効 + デフォルト値 → true を返す", () => {
    const project: ProjectData = {
      name: "test",
      width: 100,
      height: 100,
      layers: [],
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders: [],
      stateMachines: [],
    };
    useEditorStore.setState({ project });
    useParameterStore.setState({ parameterValues: { p1: 0 } });
    useViewportStore.setState({ defaultFormLocked: true });

    const { result } = renderHook(() => useDefaultFormLock());
    expect(result.current).toBe(true);
  });

  it("ロック有効 + パラメータ変更済み → false を返す", () => {
    const project: ProjectData = {
      name: "test",
      width: 100,
      height: 100,
      layers: [],
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders: [],
      stateMachines: [],
    };
    useEditorStore.setState({ project });
    useParameterStore.setState({ parameterValues: { p1: 15 } });
    useViewportStore.setState({ defaultFormLocked: true });

    const { result } = renderHook(() => useDefaultFormLock());
    expect(result.current).toBe(false);
  });
});
