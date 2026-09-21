import { act, cleanup, renderHook } from "@testing-library/react";
import * as ikSolver from "@vivi2d/core/ik-solver";
import * as layerSync from "@vivi2d/renderer-pixi/editor-layer-sync";
import { Container, Graphics } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useParameterStore } from "@/stores/parameterStore";
import { mutateProject } from "@/stores/projectMutator";
import {
  createBoneNode,
  createGroup,
  createIKController,
  createProject,
  createViviMesh,
} from "@/test/fixtures";
import {
  resetEditorStore,
  resetIKRuntimeStore,
  resetParameterStore,
} from "@/test/store-reset";
import { flattenBonesFromLayers, useIK } from "../useIK";
import { useLayerSync } from "../useLayerSync";

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

    const solver = await import("@vivi2d/core/ik-solver");
    const solve = vi.spyOn(solver, "solveIKController");
    const { unmount } = renderHook(() => useIK());
    try {
      useIKRuntimeStore.getState().setRuntimeTarget("dummy", 0, 0);
      await flushRAF();
      expect(solve).toHaveBeenLastCalledWith(
        controller,
        expect.any(Map),
        expect.any(Map),
      );
      expect(useIKRuntimeStore.getState().solutions.has(controller.id)).toBe(true);

      solve.mockClear();
      useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 65, 25);
      await flushRAF();
      expect(solve).toHaveBeenLastCalledWith(
        { ...controller, targetX: 65, targetY: 25 },
        expect.any(Map),
        expect.any(Map),
      );
      expect(controller.targetX).toBe(90);
      expect(controller.targetY).toBe(10);
    } finally {
      unmount();
      solve.mockRestore();
    }
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
      targetX: 1000,
      targetY: 0,
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
    useParameterStore.setState({
      parameterValues: { "param-arm-rot": 0.75, untouched: 0.625 },
    });

    const { unmount } = renderHook(() => useIK());
    useIKRuntimeStore.getState().setRuntimeTarget(controller.id, 1000, 0);
    await flushRAF();

    // Far target on +X solves the root angle to zero, the midpoint of [-PI, PI].
    expect(useParameterStore.getState().parameterValues).toEqual({
      "param-arm-rot": 0,
      untouched: 0.625,
    });
    unmount();
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

describe("v11 IK captured publication", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  beforeEach(() => {
    resetEditorStore();
    useEditorStore.setState({ projectV11: null });
    resetIKRuntimeStore();
    resetParameterStore();
    frames = new Map();
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState({ projectV11: null });
  });
  const tick = async () => {
    await act(async () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    });
  };
  function setup(count = 1) {
    const b0 = createBoneNode({
      id: "b0",
      x: 0,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const b1 = createBoneNode({
      id: "b1",
      x: 50,
      y: 0,
      bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
    });
    const controllers = Array.from({ length: count }, (_, index) =>
      createIKController({
        id: `ik-${index}`,
        targetX: 70,
        targetY: 20,
        influence: 1,
        solverType: "twoBone",
        boneChain: [
          { boneId: b0.id, minAngle: -Math.PI, maxAngle: Math.PI },
          { boneId: b1.id, minAngle: -Math.PI, maxAngle: Math.PI },
        ],
      }),
    );
    const project = createProject({
      layers: [b0, b1],
      ikControllers: controllers,
      parameters: [{ id: "p", name: "p", minValue: 0, maxValue: 1, defaultValue: 0 }],
    });
    // Opaque owner identity only: this hook coordination test is not IO admission.
    const session = { carrier: {} } as NonNullable<
      ReturnType<typeof useEditorStore.getState>["projectV11"]
    >;
    useEditorStore.setState({ project, projectV11: session });
    useParameterStore.setState({ parameterValues: { p: 0, untouched: 0.625 } });
    return {
      project: useEditorStore.getState().project!,
      session: useEditorStore.getState().projectV11!,
      controllers,
    };
  }

  it("suppresses only its successful parameter-origin trigger across actual React effects", async () => {
    const { project, session } = setup();
    let invocation = 0;
    const map = vi
      .spyOn(ikSolver, "mapIKToParameters")
      .mockImplementation(() => ({ p: ++invocation % 2 }));
    const hook = renderHook(() => {
      useIK();
      return useParameterStore((state) => state.parameterValues);
    });
    await tick();
    const own = hook.result.current;
    expect(own.p).toBe(1);
    expect(map).toHaveBeenCalledTimes(1);
    await tick();
    await tick();
    expect(map).toHaveBeenCalledTimes(1);
    act(() => useIKRuntimeStore.setState({ solutions: new Map() }));
    await tick();
    expect(map).toHaveBeenCalledTimes(1);
    // Saving metadata is not a new carrier/input; it must not run IK.
    act(() => useEditorStore.setState({ projectV11: { ...session } }));
    await tick();
    expect(map).toHaveBeenCalledTimes(1);
    act(() => useParameterStore.getState().setParameterValue("p", 0.25));
    await tick();
    await tick();
    expect(map).toHaveBeenCalledTimes(2);
    expect(hook.result.current.p).toBe(0);
    const secondOwn = hook.result.current;
    act(() => useEditorStore.setState({ project: { ...project, name: "binding edit" } }));
    await tick();
    expect(map).toHaveBeenCalledTimes(3);
    act(() => useEditorStore.setState({ project })); // Undo identity, same own parameters.
    await tick();
    expect(map).toHaveBeenCalledTimes(4);
    expect(hook.result.current).not.toBe(secondOwn);
    act(() => useIKRuntimeStore.getState().setRuntimeTarget("ik-0", 80, 10));
    await tick();
    await tick();
    expect(map).toHaveBeenCalledTimes(5);
    expect(useEditorStore.getState().project).toBe(project);
    expect(frames.size).toBe(0);
  });

  it("feeds projected bones/controllers to the real solver and replaces stale solutions", async () => {
    const seed = setup(2);
    const bindings = [
      {
        id: "x",
        parameterId: "p",
        target: { type: "bone" as const, boneId: "b0", property: "x" as const },
        bindingPoints: [{ paramValue: 0, targetValue: 5 }],
      },
      ...(["targetX", "targetY", "poleTargetX", "poleTargetY", "influence"] as const).map(
        (property, index) => ({
          id: property,
          parameterId: "p",
          target: { type: "ikController" as const, controllerId: "ik-0", property },
          bindingPoints: [{ paramValue: 0, targetValue: [60, 30, 20, 40, 0.5][index]! }],
        }),
      ),
    ];
    const project = {
      ...seed.project,
      parameterBindings: bindings,
      ikControllers: [seed.controllers[0]!, { ...seed.controllers[1]!, influence: 0 }],
    };
    useEditorStore.setState({ project });
    const authored = useEditorStore.getState().project!;
    useIKRuntimeStore.getState().setRuntimeTarget("ik-0", 80, 10);
    useIKRuntimeStore.setState({
      solutions: new Map([["removed", { solvedAngles: new Map(), reached: false }]]),
    });
    const parameters = useParameterStore.getState().parameterValues;
    const history = useHistoryStore.getState().undoStack;
    const solve = vi.spyOn(ikSolver, "solveIKController");
    renderHook(() => useIK());
    await tick();
    expect(solve).toHaveBeenCalledTimes(1);
    expect(solve.mock.calls[0]![0]).toMatchObject({
      targetX: 80,
      targetY: 10,
      poleTargetX: 20,
      poleTargetY: 40,
      influence: 0.5,
    });
    expect(solve.mock.calls[0]![1].get("b0")![4]).toBe(5);
    expect([...useIKRuntimeStore.getState().solutions.keys()]).toEqual(["ik-0"]);
    expect(useParameterStore.getState().parameterValues).toBe(parameters);
    expect(useEditorStore.getState().project).toBe(authored);
    expect(authored.layers[0]!.x).toBe(0);
    expect(useHistoryStore.getState().undoStack).toBe(history);
  });

  it("hands its own mapped parameter to the real display hook without another IK solve", async () => {
    const seed = setup();
    useEditorStore.setState({
      project: {
        ...seed.project,
        parameterBindings: [
          {
            id: "display-x",
            parameterId: "p",
            target: { type: "bone", boneId: "b0", property: "x" },
            bindingPoints: [
              { paramValue: 0, targetValue: 0 },
              { paramValue: 1, targetValue: 5 },
            ],
          },
        ],
      },
    });
    const authored = useEditorStore.getState().project!;
    let invocations = 0;
    const map = vi
      .spyOn(ikSolver, "mapIKToParameters")
      .mockImplementation(() => ({ p: ++invocations % 2 }));
    // Fixed renderer participant boundary only: real hooks/projection/store effects.
    // The minimal app capability/event adapter below does not claim a GPU render.
    const prepare = vi.spyOn(layerSync, "prepareLayerSyncV11").mockImplementation(() => ({
      commit: vi.fn(),
      rollback: vi.fn(),
      finalize: vi.fn(),
    }));
    const world = new Container(),
      background = new Graphics();
    const refs = {
      current: {
        app: {
          screen: { width: 64, height: 64 },
          renderer: {
            resolution: 1,
            gl: { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 },
            on: vi.fn(),
            off: vi.fn(),
          },
        },
        world,
        background,
        renderSafely: vi.fn(),
        markDisplayReady: vi.fn(),
      },
    } as unknown as Parameters<typeof useLayerSync>[0];
    const hook = renderHook(() => {
      useLayerSync(refs);
      useIK();
    });
    try {
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(prepare.mock.calls[0]![3]!.layers[0]!.x).toBe(0);
      await tick();
      expect(map).toHaveBeenCalledTimes(1);
      expect(prepare).toHaveBeenCalledTimes(2);
      const displayed = prepare.mock.calls[1]!;
      expect(displayed[3]!.layers[0]!.x).toBe(5);
      expect(displayed[4]!.parameterValues).toBe(
        useParameterStore.getState().parameterValues,
      );
      expect(displayed[4]!.parameterValues!.p).toBe(1);
      await tick();
      await tick();
      expect(map).toHaveBeenCalledTimes(1);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().project).toBe(authored);
      expect(authored.layers[0]!.x).toBe(0);
    } finally {
      hook.unmount();
      world.destroy();
      background.destroy();
    }
  });

  it.each([
    "throw",
    "nonfinite",
  ])("prepares both controllers before any write: late %s", async (failure) => {
    setup(2);
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    const writes = vi.fn(),
      offIK = useIKRuntimeStore.subscribe(writes),
      offP = useParameterStore.subscribe(writes);
    let calls = 0;
    vi.spyOn(ikSolver, "mapIKToParameters").mockImplementation(() => {
      if (++calls === 1) return { p: 7 };
      if (failure === "throw") throw new Error("raw mapper detail must stay private");
      return { p: Number.NaN };
    });
    renderHook(() => useIK());
    await tick();
    await tick();
    expect(calls).toBe(2);
    expect(writes).not.toHaveBeenCalled();
    expect(useIKRuntimeStore.getState().solutions).toBe(solutions);
    expect(useParameterStore.getState().parameterValues).toBe(parameters);
    offIK();
    offP();
  });

  it.each([
    "runtime coordinate",
    "bone length",
    "computed world",
    "solved angle",
  ])("rejects nonfinite %s before any reflected write", async (kind) => {
    const { project } = setup();
    if (kind === "runtime coordinate")
      useIKRuntimeStore.getState().setRuntimeTarget("ik-0", Number.POSITIVE_INFINITY, 0);
    if (kind === "bone length" || kind === "computed world") {
      const layers = project.layers.map((layer, index) => {
        if (layer.kind !== "bone") return layer;
        return {
          ...layer,
          parentBoneId: index === 1 ? "b0" : undefined,
          bone: {
            ...layer.bone,
            length: kind === "bone length" ? Number.NaN : 50,
            scaleX: kind === "computed world" ? Number.MAX_VALUE : 1,
          },
        };
      });
      useEditorStore.setState({ project: { ...project, layers } });
    }
    const solve = vi.spyOn(ikSolver, "solveIKController");
    if (kind === "solved angle")
      solve.mockReturnValue({
        solvedAngles: new Map([["b0", Number.NaN]]),
        reached: false,
      });
    const map = vi.spyOn(ikSolver, "mapIKToParameters");
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    const writes = vi.fn(),
      offIK = useIKRuntimeStore.subscribe(writes),
      offP = useParameterStore.subscribe(writes);
    renderHook(() => useIK());
    await tick();
    await tick();
    expect(solve).toHaveBeenCalledTimes(kind === "solved angle" ? 1 : 0);
    expect(map).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(useIKRuntimeStore.getState().solutions).toBe(solutions);
    expect(useParameterStore.getState().parameterValues).toBe(parameters);
    offIK();
    offP();
  });

  it("keeps controller mapping order and unrelated captured values", async () => {
    setup(2);
    const map = vi
      .spyOn(ikSolver, "mapIKToParameters")
      .mockReturnValueOnce({ p: 1 })
      .mockReturnValueOnce({ p: 2 });
    renderHook(() => useIK());
    await tick();
    await tick();
    expect(map.mock.calls.map(([controller]) => controller.id)).toEqual(["ik-0", "ik-1"]);
    expect(useParameterStore.getState().parameterValues).toEqual({
      p: 2,
      untouched: 0.625,
    });
  });

  it("keeps __proto__ as an own numeric key through the real IK mapper and publication", async () => {
    const seed = setup(2);
    const controllers = seed.controllers.map((controller, index) => ({
      ...controller,
      parameterMappings: [
        {
          boneId: "b0",
          parameterId: "__proto__",
          angleMin: -Math.PI,
          angleMax: Math.PI,
          paramMin: index,
          paramMax: index + 1,
        },
      ],
    }));
    useEditorStore.setState({ project: { ...seed.project, ikControllers: controllers } });
    useParameterStore.setState({
      parameterValues: Object.fromEntries([
        ["__proto__", 0.5],
        ["untouched", 0.625],
      ]),
    });
    const map = vi.spyOn(ikSolver, "mapIKToParameters"); // Real implementation, not stub output.
    renderHook(() => useIK());
    await tick();
    await tick();
    expect(map).toHaveBeenCalledTimes(2);
    const last = map.mock.results[1]!.value as Record<string, number>;
    expect(Object.hasOwn(last, "__proto__")).toBe(true);
    expect(last.__proto__).toBeGreaterThanOrEqual(1);
    const values = useParameterStore.getState().parameterValues;
    expect(Object.hasOwn(values, "__proto__")).toBe(true);
    expect(values.__proto__).toBe(last.__proto__);
    expect(values.untouched).toBe(0.625);
    expect(frames.size).toBe(0);
  });

  it.each([
    "parameters",
    "solutions",
  ])("rechecks %s after calculation and before the first reflected write", async (kind) => {
    setup();
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    const newerParameters = { p: 0.5 },
      newerSolutions = new Map<string, ikSolver.IKSolution>();
    // Trusted raw replacement models a stale computed result, not a supported
    // reentrant writer. The publisher must not overwrite the newer owner.
    vi.spyOn(ikSolver, "mapIKToParameters").mockImplementation(() => {
      if (kind === "parameters")
        useParameterStore.setState({ parameterValues: newerParameters });
      else useIKRuntimeStore.setState({ solutions: newerSolutions });
      return { p: 7 };
    });
    const ikWrites = vi.fn(),
      pWrites = vi.fn(),
      offIK = useIKRuntimeStore.subscribe(ikWrites),
      offP = useParameterStore.subscribe(pWrites);
    const hook = renderHook(() => useIK());
    await tick();
    hook.unmount();
    expect(ikWrites).toHaveBeenCalledTimes(kind === "solutions" ? 1 : 0);
    expect(pWrites).toHaveBeenCalledTimes(kind === "parameters" ? 1 : 0);
    expect(useIKRuntimeStore.getState().solutions).toBe(
      kind === "solutions" ? newerSolutions : solutions,
    );
    expect(useParameterStore.getState().parameterValues).toBe(
      kind === "parameters" ? newerParameters : parameters,
    );
    offIK();
    offP();
  });

  it("bars all seven ordinary writers and project edits during publication, then restores", async () => {
    const { project } = setup();
    vi.spyOn(ikSolver, "mapIKToParameters").mockReturnValue({ p: 7 });
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    const targets = useIKRuntimeStore.getState().runtimeTargets,
      history = useHistoryStore.getState().undoStack;
    let rejected = 0;
    const off = useIKRuntimeStore.subscribe((state) => {
      if (state.solutions === solutions) return;
      const p = useParameterStore.getState(),
        ik = useIKRuntimeStore.getState();
      for (const write of [
        () => p.setParameterValue("p", 99),
        () => p.setAllValues({ p: 99 }),
        () => p.clear(),
        () => ik.setSolution("x", { solvedAngles: new Map(), reached: false }),
        () => ik.setRuntimeTarget("ik-0", 99, 99),
        () => ik.clearRuntimeTarget("ik-0"),
        () => ik.clearAll(),
        () =>
          mutateProject((value) => {
            value.name = "bad reentry";
          }),
      ]) {
        expect(write).toThrow("PROJECT_TRANSACTION_BUSY");
        rejected++;
      }
      throw new Error("fixed subscriber rejection");
    });
    renderHook(() => useIK());
    await tick();
    await tick();
    off();
    expect(rejected).toBe(8);
    expect(useIKRuntimeStore.getState().solutions).toBe(solutions);
    expect(useIKRuntimeStore.getState().runtimeTargets).toBe(targets);
    expect(useParameterStore.getState().parameterValues).toBe(parameters);
    expect(useEditorStore.getState().project).toBe(project);
    expect(useHistoryStore.getState().undoStack).toBe(history);
  });

  it("marks both writes before notifications and independently restores despite rollback throws", async () => {
    setup();
    const map = vi.spyOn(ikSolver, "mapIKToParameters").mockReturnValue({ p: 7 });
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    let ikNotifications = 0,
      parameterNotifications = 0;
    let attempted: Record<string, number> | undefined;
    const offIK = useIKRuntimeStore.subscribe((state) => {
      ikNotifications++;
      if (state.solutions === solutions)
        throw new Error("fixed IK rollback notification");
    });
    const offP = useParameterStore.subscribe((state) => {
      parameterNotifications++;
      if (state.parameterValues !== parameters) attempted = state.parameterValues;
      throw new Error("fixed parameter commit/rollback notification");
    });
    renderHook(() => useIK());
    await tick();
    await tick();
    offIK();
    offP();
    expect(ikNotifications).toBe(2);
    expect(parameterNotifications).toBe(2);
    expect(useIKRuntimeStore.getState().solutions).toBe(solutions);
    expect(useParameterStore.getState().parameterValues).toBe(parameters);
    expect(map).toHaveBeenCalledTimes(1);
    // Failed output must not have been remembered as successfully owned.
    act(() => useParameterStore.getState().setAllValues(attempted!));
    await tick();
    expect(map).toHaveBeenCalledTimes(2);
  });

  it.each([
    "parameters",
    "targets",
    "project",
    "carrier",
  ])("rejects an old RAF after a new %s snapshot", async (kind) => {
    const seed = setup();
    const map = vi.spyOn(ikSolver, "mapIKToParameters").mockReturnValue({ p: 7 });
    const solutions = useIKRuntimeStore.getState().solutions;
    renderHook(() => useIK());
    const oldRAF = [...frames.values()][0]!;
    act(() => {
      if (kind === "parameters") useParameterStore.getState().setParameterValue("p", 0.5);
      if (kind === "targets")
        useIKRuntimeStore.getState().setRuntimeTarget("ik-0", 80, 20);
      if (kind === "project") useEditorStore.setState({ project: { ...seed.project } });
      if (kind === "carrier")
        useEditorStore.setState({
          projectV11: { ...seed.session, carrier: {} as typeof seed.session.carrier },
        });
      oldRAF(0); // Even a delivered canceled callback must validate its capture.
    });
    expect(map).not.toHaveBeenCalled();
    expect(useIKRuntimeStore.getState().solutions).toBe(solutions);
    await tick();
    expect(map).toHaveBeenCalledTimes(1);
  });

  it.each([
    "parameters",
    "targets",
    "solutions",
  ])("preserves a genuinely newer trusted raw %s replacement", async (kind) => {
    setup();
    vi.spyOn(ikSolver, "mapIKToParameters").mockReturnValue({ p: 7 });
    const solutions = useIKRuntimeStore.getState().solutions,
      parameters = useParameterStore.getState().parameterValues;
    const rawP = { p: 99 },
      rawTargets = new Map([["ik-0", { x: 99, y: 99 }]]);
    const rawSolutions = new Map([
      ["raw", { solvedAngles: new Map<string, number>(), reached: false }],
    ]);
    const off = useParameterStore.subscribe((state) => {
      if (state.parameterValues === parameters || state.parameterValues === rawP) return;
      if (kind === "parameters") useParameterStore.setState({ parameterValues: rawP });
      if (kind === "targets") useIKRuntimeStore.setState({ runtimeTargets: rawTargets });
      if (kind === "solutions") useIKRuntimeStore.setState({ solutions: rawSolutions });
      throw new Error("trusted raw replacement, not a supported reentrant command");
    });
    const hook = renderHook(() => useIK());
    await tick();
    off();
    hook.unmount();
    expect(useParameterStore.getState().parameterValues).toBe(
      kind === "parameters" ? rawP : parameters,
    );
    expect(useIKRuntimeStore.getState().solutions).toBe(
      kind === "solutions" ? rawSolutions : solutions,
    );
    if (kind === "targets")
      expect(useIKRuntimeStore.getState().runtimeTargets).toBe(rawTargets);
  });
});
