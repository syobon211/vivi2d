import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { stepAllPhysics, usePhysics } from "@/hooks/usePhysics";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createPhysicsGroup, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetParameterStore,
  resetPhysicsStore,
  resetTimelineStore,
} from "@/test/store-reset";

describe("usePhysics", () => {
  beforeEach(() => {
    resetEditorStore();
    resetParameterStore();
    resetPhysicsStore();
    resetTimelineStore();
  });

  it("プロジェクト設定時に物理状態を初期化する", () => {
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
    });
    const project = createProject({ physicsGroups: [group] });
    useEditorStore.setState({ project, projectVersion: 1 });

    renderHook(() => usePhysics());

    const states = usePhysicsStore.getState().runtimeStates;
    expect(states[group.id]).toHaveLength(1);
    expect(states[group.id]![0]).toEqual({ angle: 0, angularVelocity: 0 });
  });

  it("プロジェクトなしでもエラーにならない", () => {
    expect(() => renderHook(() => usePhysics())).not.toThrow();
  });
});

describe("stepAllPhysics", () => {
  beforeEach(() => {
    resetEditorStore();
    resetParameterStore();
    resetPhysicsStore();
    resetTimelineStore();
  });

  it("物理グループがない場合は空オブジェクトを返す", () => {
    const project = createProject({ physicsGroups: [] });
    useEditorStore.setState({ project });
    const result = stepAllPhysics(1 / 60);
    expect(result).toEqual({ parameters: {}, bones: {} });
  });

  it("無効なグループはスキップする", () => {
    const group = createPhysicsGroup({
      enabled: false,
      outputs: [{ parameterId: "hair-x", pendulumIndex: 0, weight: 10, type: "angle" }],
    });
    const project = createProject({
      physicsGroups: [group],
      parameters: [
        { id: "hair-x", name: "髪X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);

    const result = stepAllPhysics(1 / 60);
    expect(result).toEqual({ parameters: {}, bones: {} });
  });

  it("isActive が false の場合はスキップする", () => {
    const group = createPhysicsGroup({
      outputs: [{ parameterId: "hair-x", pendulumIndex: 0, weight: 10, type: "angle" }],
    });
    const project = createProject({
      physicsGroups: [group],
      parameters: [
        { id: "hair-x", name: "髪X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);
    usePhysicsStore.getState().setActive(false);

    const result = stepAllPhysics(1 / 60);
    expect(result).toEqual({ parameters: {}, bones: {} });
  });

  it("物理シミュレーションの出力値を返す", () => {
    const paramId = "hair-x";
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0 }],
      inputs: [{ parameterId: "head-x", weight: 5, type: "x" }],
      outputs: [{ parameterId: paramId, pendulumIndex: 0, weight: 10, type: "angle" }],
      gravityStrength: 0,
    });
    const project = createProject({
      physicsGroups: [group],
      parameters: [
        { id: "head-x", name: "顔X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: paramId, name: "髪X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);

    usePhysicsStore.getState().snapshotParamValues({ "head-x": 0 });
    useParameterStore.getState().setAllValues({ "head-x": 10 });

    const result = stepAllPhysics(1 / 60);
    expect(typeof result.parameters[paramId]).toBe("number");
    expect(result.parameters[paramId]).toBeGreaterThanOrEqual(-30);
    expect(result.parameters[paramId]).toBeLessThanOrEqual(30);
  });

  it("previousParamValues を更新する", () => {
    const group = createPhysicsGroup();
    const project = createProject({ physicsGroups: [group] });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);
    useParameterStore.getState().setAllValues({ p1: 42 });

    stepAllPhysics(1 / 60);

    expect(usePhysicsStore.getState().previousParamValues.p1).toBe(42);
  });

  it("プロジェクトなしでは空オブジェクトを返す", () => {
    const result = stepAllPhysics(1 / 60);
    expect(result).toEqual({ parameters: {}, bones: {} });
  });

  it("非再生時はパラメータストアに直接反映する", () => {
    const paramId = "hair-x";
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0 }],
      inputs: [{ parameterId: "head-x", weight: 5, type: "x" }],
      outputs: [{ parameterId: paramId, pendulumIndex: 0, weight: 10, type: "angle" }],
      gravityStrength: 0,
    });
    const project = createProject({
      physicsGroups: [group],
      parameters: [
        { id: "head-x", name: "顔X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: paramId, name: "髪X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);

    usePhysicsStore.getState().snapshotParamValues({ "head-x": 0 });
    useParameterStore.getState().setAllValues({ "head-x": 10 });

    useTimelineStore.setState({ isPlaying: false });
    stepAllPhysics(1 / 60);

    const values = useParameterStore.getState().parameterValues;
    expect(typeof values[paramId]).toBe("number");
    expect(values[paramId]).toBeGreaterThanOrEqual(-30);
    expect(values[paramId]).toBeLessThanOrEqual(30);
  });

  it("再生時はパラメータストアに直接反映しない", () => {
    const paramId = "hair-x";
    const group = createPhysicsGroup({
      pendulums: [{ length: 1, mass: 1, damping: 0 }],
      inputs: [{ parameterId: "head-x", weight: 5, type: "x" }],
      outputs: [{ parameterId: paramId, pendulumIndex: 0, weight: 10, type: "angle" }],
      gravityStrength: 0,
    });
    const project = createProject({
      physicsGroups: [group],
      parameters: [
        { id: "head-x", name: "顔X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: paramId, name: "髪X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    });
    useEditorStore.setState({ project });
    usePhysicsStore.getState().initialize([group]);

    usePhysicsStore.getState().snapshotParamValues({ "head-x": 0 });
    useParameterStore.getState().setAllValues({ "head-x": 10 });

    useTimelineStore.setState({ isPlaying: true });
    const before = { ...useParameterStore.getState().parameterValues };
    const outputs = stepAllPhysics(1 / 60);

    expect(Object.keys(outputs).length).toBeGreaterThan(0);
    expect(useParameterStore.getState().parameterValues[paramId]).toBe(before[paramId]);
  });
});
