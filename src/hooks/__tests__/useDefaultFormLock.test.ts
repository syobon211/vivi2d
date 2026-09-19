import type { ProjectData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";
import { resetAllStores } from "@/test/store-reset";



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
