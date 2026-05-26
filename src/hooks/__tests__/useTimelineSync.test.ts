import { renderHook } from "@testing-library/react";
import type { AnimationClip } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncParametersAtFrame, useTimelineSync } from "@/hooks/useTimelineSync";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetParameterStore,
  resetSelectionStore,
} from "@/test/store-reset";


function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 5 },
      ],
    },
    projectVersion: 1,
  });
  resetSelectionStore();
}

function createClip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: "clip-1",
    name: "テスト",
    duration: 90,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

function resetStores() {
  resetEditorStore();
  resetParameterStore();
}


describe("useTimelineSync (フック版)", () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it("syncParametersAtFrame を返す", () => {
    const { result } = renderHook(() => useTimelineSync());
    expect(typeof result.current.syncParametersAtFrame).toBe("function");
  });

  it("クリップが null の場合は何もしない", () => {
    setupProject();
    const { result } = renderHook(() => useTimelineSync());
    result.current.syncParametersAtFrame(null, 0);
    expect(useParameterStore.getState().parameterValues).toEqual({});
  });

  it("クリップが undefined の場合は何もしない", () => {
    setupProject();
    const { result } = renderHook(() => useTimelineSync());
    result.current.syncParametersAtFrame(undefined, 0);
    expect(useParameterStore.getState().parameterValues).toEqual({});
  });

  it("トラックなしクリップではデフォルト値を設定する", () => {
    setupProject();
    const clip = createClip();
    const { result } = renderHook(() => useTimelineSync());

    result.current.syncParametersAtFrame(clip, 0);

    const values = useParameterStore.getState().parameterValues;
    expect(values.p1).toBe(0); // defaultValue
    expect(values.p2).toBe(5); // defaultValue
  });

  it("キーフレーム値でデフォルト値を上書きする", () => {
    setupProject();
    const clip = createClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: -30, interpolation: "linear" },
            { frame: 89, value: 30, interpolation: "linear" },
          ],
        },
      ],
    });
    const { result } = renderHook(() => useTimelineSync());

    result.current.syncParametersAtFrame(clip, 0);
    expect(useParameterStore.getState().parameterValues.p1).toBe(-30);
    expect(useParameterStore.getState().parameterValues.p2).toBe(5);
  });

  it("中間フレームで補間値を反映する", () => {
    setupProject();
    const clip = createClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 89, value: 30, interpolation: "linear" },
          ],
        },
      ],
    });
    const { result } = renderHook(() => useTimelineSync());

    result.current.syncParametersAtFrame(clip, 44);
    const v = useParameterStore.getState().parameterValues.p1;
    expect(v).toBeCloseTo(30 * (44 / 89), 1);
  });
});

describe("syncParametersAtFrame (非フック版)", () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it("クリップが null の場合は何もしない", () => {
    setupProject();
    syncParametersAtFrame(null, 0);
    expect(useParameterStore.getState().parameterValues).toEqual({});
  });

  it("トラックなしクリップではデフォルト値を設定する", () => {
    setupProject();
    syncParametersAtFrame(createClip(), 0);

    const values = useParameterStore.getState().parameterValues;
    expect(values.p1).toBe(0);
    expect(values.p2).toBe(5);
  });

  it("キーフレーム値でデフォルト値を上書きする", () => {
    setupProject();
    const clip = createClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: 10, interpolation: "linear" },
            { frame: 89, value: 20, interpolation: "linear" },
          ],
        },
      ],
    });

    syncParametersAtFrame(clip, 0);
    expect(useParameterStore.getState().parameterValues.p1).toBe(10);
    expect(useParameterStore.getState().parameterValues.p2).toBe(5);
  });

  it("複数トラックを同時に評価する", () => {
    setupProject();
    const clip = createClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [{ frame: 0, value: 15, interpolation: "linear" }],
        },
        {
          parameterId: "p2",
          keyframes: [{ frame: 0, value: -10, interpolation: "linear" }],
        },
      ],
    });

    syncParametersAtFrame(clip, 0);
    const values = useParameterStore.getState().parameterValues;
    expect(values.p1).toBe(15);
    expect(values.p2).toBe(-10);
  });

  it("プロジェクトがない場合でもトラック値は反映する", () => {
    const clip = createClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [{ frame: 0, value: 42, interpolation: "linear" }],
        },
      ],
    });

    syncParametersAtFrame(clip, 0);
    const values = useParameterStore.getState().parameterValues;
    expect(values.p1).toBe(42);
  });
});
