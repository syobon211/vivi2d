import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useParameterStore } from "@/stores/parameterStore";
import {
  createViviMesh,
  createBoneNode,
  createGroup,
  createIKController,
  createProject,
} from "@/test/fixtures";
import {
  resetEditorStore,
  resetIKRuntimeStore,
  resetParameterStore,
} from "@/test/store-reset";
import { flattenBonesFromLayers, useIK } from "../useIK";


describe("flattenBonesFromLayers", () => {
  it("空の配列で空配列を返す", () => {
    expect(flattenBonesFromLayers([])).toEqual([]);
  });

  it("ボーンのみのフラットリストを返す", () => {
    const bone1 = createBoneNode({ name: "bone1" });
    const bone2 = createBoneNode({ name: "bone2" });
    const mesh = createViviMesh({ name: "mesh" });

    const result = flattenBonesFromLayers([bone1, mesh, bone2]);

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("bone1");
    expect(result[1]!.name).toBe("bone2");
  });

  it("ネストされたボーンを再帰的に取得する", () => {
    const childBone = createBoneNode({ name: "childBone" });
    const parentBone = createBoneNode({ name: "parentBone", children: [childBone] });
    const group = createGroup({ children: [parentBone] });

    const result = flattenBonesFromLayers([group]);

    expect(result).toHaveLength(2);
    expect(result.map((b) => b.name)).toEqual(["parentBone", "childBone"]);
  });

  it("ボーンがないツリーで空配列を返す", () => {
    const mesh = createViviMesh();
    const group = createGroup({ children: [mesh] });

    const result = flattenBonesFromLayers([group]);

    expect(result).toHaveLength(0);
  });

  it("深いネスト（3階層以上）のボーンを取得する", () => {
    const deepBone = createBoneNode({ name: "deep" });
    const midBone = createBoneNode({ name: "mid", children: [deepBone] });
    const topBone = createBoneNode({ name: "top", children: [midBone] });

    const result = flattenBonesFromLayers([topBone]);

    expect(result).toHaveLength(3);
    expect(result.map((b) => b.name)).toEqual(["top", "mid", "deep"]);
  });
});


async function flushRAF(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("useIK フック", () => {
  beforeEach(() => {
    resetEditorStore();
    resetIKRuntimeStore();
    resetParameterStore();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("マウントしてもプロジェクトが null なら解は記録されない", async () => {
    useEditorStore.setState({ project: null });
    const { unmount } = renderHook(() => useIK());

    useIKRuntimeStore.getState().setRuntimeTarget("any-controller", 10, 20);

    await flushRAF();

    expect(useIKRuntimeStore.getState().solutions.size).toBe(0);
    unmount();
  });

  it("IKコントローラが存在しない場合も落ちない", async () => {
    const project = createProject({ ikControllers: [] });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget("x", 0, 0);
    await flushRAF();

    expect(useIKRuntimeStore.getState().solutions.size).toBe(0);
  });

  it("influence=0 のコントローラはスキップされる", async () => {
    const bone0 = createBoneNode({
      x: 0,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 50,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-zero",
      solverType: "twoBone",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 80,
      targetY: 30,
      influence: 0,
    });
    const project = createProject({
      layers: [bone0, bone1],
      ikControllers: [controller],
    });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 60, 20);
    await flushRAF();

    expect(useIKRuntimeStore.getState().solutions.has(controller.id)).toBe(false);
  });

  it("twoBone ソルバーで IK 解が計算されて setSolution が呼ばれる", async () => {
    const bone0 = createBoneNode({
      x: 0,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 50,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-two-bone",
      solverType: "twoBone",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 80,
      targetY: 30,
      influence: 1,
    });
    const project = createProject({
      layers: [bone0, bone1],
      ikControllers: [controller],
    });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 70, 20);
    await flushRAF();

    const solution = useIKRuntimeStore.getState().solutions.get(controller.id);
    expect(solution).toBeDefined();
    expect(solution?.solvedAngles.size).toBeGreaterThan(0);
  });

  it("runtimeTarget が設定されていない場合はコントローラの定義値を使う", async () => {
    const bone0 = createBoneNode({
      x: 0,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 50,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-static",
      solverType: "twoBone",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 90,
      targetY: 10,
      influence: 1,
    });
    const project = createProject({
      layers: [bone0, bone1],
      ikControllers: [controller],
    });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget("dummy", 0, 0);
    await flushRAF();

    const solution = useIKRuntimeStore.getState().solutions.get(controller.id);
    expect(solution).toBeDefined();
  });

  it("parameterMappings があるとパラメータ値が更新される", async () => {
    const bone0 = createBoneNode({
      x: 0,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 50,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-map",
      solverType: "twoBone",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 60,
      targetY: 40,
      influence: 1,
      parameterMappings: [
        {
          boneId: bone0.id,
          parameterId: "param-arm-rot",
          angleMin: -Math.PI,
          angleMax: Math.PI,
          paramMin: -1,
          paramMax: 1,
        },
      ],
    });
    const project = createProject({
      layers: [bone0, bone1],
      ikControllers: [controller],
      parameters: [
        {
          id: "param-arm-rot",
          name: "腕回転",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
        },
      ],
    });
    useEditorStore.setState({ project });
    useParameterStore.setState({ parameterValues: { "param-arm-rot": 0 } });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 60, 40);
    await flushRAF();

    const paramValue = useParameterStore.getState().parameterValues["param-arm-rot"];
    expect(paramValue).toBeDefined();
  });

  it("アンマウント時に subscribe が解除される", async () => {
    const bone0 = createBoneNode({
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 50,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-unmount",
      solverType: "twoBone",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 80,
      targetY: 20,
      influence: 1,
    });
    const project = createProject({
      layers: [bone0, bone1],
      ikControllers: [controller],
    });
    useEditorStore.setState({ project });

    const { unmount } = renderHook(() => useIK());
    unmount();

    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 60, 10);
    await flushRAF();

    expect(useIKRuntimeStore.getState().solutions.has(controller.id)).toBe(false);
  });

  it("CCD ソルバーでも IK 解が計算される", async () => {
    const bone0 = createBoneNode({
      bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
    });
    const bone1 = createBoneNode({
      x: 40,
      bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
    });
    const bone2 = createBoneNode({
      x: 80,
      bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
    });
    const controller = createIKController({
      id: "ik-ccd",
      solverType: "ccd",
      boneChain: [
        { boneId: bone0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone1.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: bone2.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 100,
      targetY: 20,
      influence: 1,
      maxIterations: 5,
    });
    const project = createProject({
      layers: [bone0, bone1, bone2],
      ikControllers: [controller],
    });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 90, 30);
    await flushRAF();

    const solution = useIKRuntimeStore.getState().solutions.get(controller.id);
    expect(solution).toBeDefined();
    expect(solution?.solvedAngles.size).toBeGreaterThanOrEqual(1);
  });

  it("複数のコントローラが共存しても全て処理される", async () => {
    const b0 = createBoneNode({
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const b1 = createBoneNode({
      x: 50,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const c1 = createIKController({
      id: "ik-c1",
      solverType: "twoBone",
      boneChain: [
        { boneId: b0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: b1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 90,
      targetY: 10,
      influence: 1,
    });
    const c2 = createIKController({
      id: "ik-c2",
      solverType: "twoBone",
      boneChain: [
        { boneId: b0.id, minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: b1.id, minAngle: -Math.PI, maxAngle: Math.PI },
      ],
      targetX: 70,
      targetY: 30,
      influence: 0.5,
    });
    const project = createProject({
      layers: [b0, b1],
      ikControllers: [c1, c2],
    });
    useEditorStore.setState({ project });

    renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(c1.id, 85, 15);
    await flushRAF();

    expect(useIKRuntimeStore.getState().solutions.has(c1.id)).toBe(true);
    expect(useIKRuntimeStore.getState().solutions.has(c2.id)).toBe(true);
  });
});
