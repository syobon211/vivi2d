
import type { Affine2D } from "@vivi2d/core/bone-utils";
import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import type { IKSolution } from "@vivi2d/core/ik-solver";
import { mapIKToParameters, solveIKController } from "@vivi2d/core/ik-solver";
import { evaluateIKControllerTracksAtFrame } from "@vivi2d/core/timeline-utils";
import type {
  IKBoneConstraint,
  IKController,
  IKControllerTrack,
} from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { createBoneNode } from "@/test/fixtures";
import { setupTestProject } from "@/test/helpers";

function getIKControllers(): IKController[] {
  return useEditorStore.getState().project?.ikControllers ?? [];
}

describe("IK統合テスト", () => {
  beforeEach(() => {
    setupTestProject();
  });

  describe("ストア→ソルバー→パラメータマッピング", () => {
    it("ストアでIKコントローラ追加→ターゲット設定→ソルバー実行→パラメータマッピング検証", () => {
      const store = useIKControllerStore.getState();

      const boneChain: IKBoneConstraint[] = [
        { boneId: "bone-upper", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "bone-lower", minAngle: -Math.PI, maxAngle: Math.PI },
      ];
      const controllerId = store.addIKController("テストIK", "twoBone", boneChain);

      store.setTarget(controllerId, 100, 0);

      store.addParameterMapping(controllerId, {
        boneId: "bone-upper",
        parameterId: "param-angle",
        angleMin: -Math.PI,
        angleMax: Math.PI,
        paramMin: -30,
        paramMax: 30,
      });

      const controllers = getIKControllers();
      expect(controllers).toHaveLength(1);
      expect(controllers[0]!.targetX).toBe(100);
      expect(controllers[0]!.targetY).toBe(0);
      expect(controllers[0]!.parameterMappings).toHaveLength(1);

      const worldTransforms = new Map<string, Affine2D>();
      worldTransforms.set("bone-upper", [1, 0, 0, 1, 0, 0]);
      worldTransforms.set("bone-lower", [1, 0, 0, 1, 50, 0]); // x=50

      const boneLengths = new Map<string, number>();
      boneLengths.set("bone-upper", 50);
      boneLengths.set("bone-lower", 50);

      const solution = solveIKController(controllers[0]!, worldTransforms, boneLengths);
      expect(solution.solvedAngles.size).toBeGreaterThan(0);
      expect(solution.reached).toBe(true);

      const params = mapIKToParameters(controllers[0]!, solution);
      expect(params).toHaveProperty("param-angle");
      expect(typeof params["param-angle"]).toBe("number");
    });

    it("ボーンツリーからワールド変換行列を計算→IKソルバーに渡す完全フロー", () => {
      const rootBone = createBoneNode({
        id: "bone-root",
        name: "ルート",
        x: 100,
        y: 200,
        bone: { angle: 0, length: 80, scaleX: 1, scaleY: 1 },
      });
      const childBone = createBoneNode({
        id: "bone-child",
        name: "子ボーン",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 60, scaleX: 1, scaleY: 1 },
        parentBoneId: "bone-root",
      });
      rootBone.children = [childBone];

      useEditorStore.setState((state) => {
        if (state.project) {
          state.project.layers = [rootBone];
        }
      });

      const project = useEditorStore.getState().project!;
      const worldTransforms = computeBoneWorldTransforms(project.layers);

      const rootWT = worldTransforms.get("bone-root");
      expect(rootWT).toBeDefined();
      expect(rootWT![4]).toBe(100); // tx
      expect(rootWT![5]).toBe(200); // ty

      const controller: IKController = {
        id: "ik-test",
        name: "テストIK",
        solverType: "twoBone",
        boneChain: [
          { boneId: "bone-root", minAngle: -Math.PI, maxAngle: Math.PI },
          { boneId: "bone-child", minAngle: -Math.PI, maxAngle: Math.PI },
        ],
        targetX: 200,
        targetY: 200,
        influence: 1,
        parameterMappings: [],
      };

      const boneLengths = new Map<string, number>();
      boneLengths.set("bone-root", 80);
      boneLengths.set("bone-child", 60);

      const solution = solveIKController(controller, worldTransforms, boneLengths);
      expect(solution.solvedAngles.size).toBe(2);
      expect(solution.reached).toBe(true);
    });
  });

  describe("ランタイムストア連携", () => {
    it("ランタイムストアにソリューションを保存→取得→パラメータ変換", () => {
      const store = useIKControllerStore.getState();
      const runtime = useIKRuntimeStore.getState();

      const boneChain: IKBoneConstraint[] = [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
      ];
      const cId = store.addIKController("ランタイムテスト", "twoBone", boneChain);

      store.addParameterMapping(cId, {
        boneId: "b1",
        parameterId: "p-angle",
        angleMin: -Math.PI / 2,
        angleMax: Math.PI / 2,
        paramMin: 0,
        paramMax: 1,
      });

      const solution: IKSolution = {
        solvedAngles: new Map([
          ["b1", 0],
          ["b2", Math.PI / 4],
        ]),
        reached: true,
      };

      runtime.setSolution(cId, solution);

      const stored = useIKRuntimeStore.getState().solutions.get(cId);
      expect(stored).toBeDefined();
      expect(stored!.reached).toBe(true);
      expect(stored!.solvedAngles.get("b1")).toBe(0);

      const controllers = getIKControllers();
      const params = mapIKToParameters(controllers[0]!, stored!);
      expect(params["p-angle"]).toBeDefined();
      expect(params["p-angle"]).toBeCloseTo(0.5, 1);
    });

    it("ランタイムターゲットの設定・クリアが正しく動作する", () => {
      const runtime = useIKRuntimeStore.getState();

      runtime.setRuntimeTarget("ik-1", 150, 250);
      expect(useIKRuntimeStore.getState().runtimeTargets.get("ik-1")).toEqual({
        x: 150,
        y: 250,
      });

      runtime.clearRuntimeTarget("ik-1");
      expect(useIKRuntimeStore.getState().runtimeTargets.has("ik-1")).toBe(false);
    });
  });

  describe("IKタイムライントラック連携", () => {
    it("IKタイムライントラックの評価→ターゲット位置補間→ソルバー実行", () => {
      const tracks: IKControllerTrack[] = [
        {
          controllerId: "ik-anim",
          targetXKeyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 30, value: 300, interpolation: "linear" },
          ],
          targetYKeyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 30, value: 150, interpolation: "linear" },
          ],
        },
      ];

      const trackValues = evaluateIKControllerTracksAtFrame(tracks, 15);
      expect(trackValues["ik-anim"]).toBeDefined();
      expect(trackValues["ik-anim"]!.targetX).toBeCloseTo(150, 1);
      expect(trackValues["ik-anim"]!.targetY).toBeCloseTo(75, 1);

      const controller: IKController = {
        id: "ik-anim",
        name: "アニメIK",
        solverType: "twoBone",
        boneChain: [
          { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
          { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
        ],
        targetX: trackValues["ik-anim"]!.targetX,
        targetY: trackValues["ik-anim"]!.targetY,
        influence: 1,
        parameterMappings: [],
      };

      const worldTransforms = new Map<string, Affine2D>();
      worldTransforms.set("b1", [1, 0, 0, 1, 0, 0]);
      worldTransforms.set("b2", [1, 0, 0, 1, 100, 0]);

      const boneLengths = new Map<string, number>();
      boneLengths.set("b1", 100);
      boneLengths.set("b2", 100);

      const solution = solveIKController(controller, worldTransforms, boneLengths);
      expect(solution.solvedAngles.size).toBe(2);
      expect(solution.reached).toBe(true);
    });

    it("複数フレームで連続的にIKを解いてターゲット追従を確認", () => {
      const tracks: IKControllerTrack[] = [
        {
          controllerId: "ik-seq",
          targetXKeyframes: [
            { frame: 0, value: 50, interpolation: "linear" },
            { frame: 10, value: 100, interpolation: "linear" },
          ],
          targetYKeyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 10, value: 0, interpolation: "linear" },
          ],
        },
      ];

      const frames = [0, 5, 10];
      const targetXValues: number[] = [];

      for (const frame of frames) {
        const values = evaluateIKControllerTracksAtFrame(tracks, frame);
        targetXValues.push(values["ik-seq"]!.targetX);
      }

      expect(targetXValues[0]!).toBeCloseTo(50, 1);
      expect(targetXValues[1]!).toBeCloseTo(75, 1);
      expect(targetXValues[2]!).toBeCloseTo(100, 1);
      expect(targetXValues[0]!).toBeLessThan(targetXValues[1]!);
      expect(targetXValues[1]!).toBeLessThan(targetXValues[2]!);
    });
  });

  describe("influenceブレンド", () => {
    it("influence=0 の場合はFK角度が維持される", () => {
      const store = useIKControllerStore.getState();
      const boneChain: IKBoneConstraint[] = [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
      ];
      const cId = store.addIKController("Influence0", "twoBone", boneChain);
      store.setInfluence(cId, 0);

      const controllers = getIKControllers();
      expect(controllers[0]!.influence).toBe(0);

      const worldTransforms = new Map<string, Affine2D>();
      worldTransforms.set("b1", [1, 0, 0, 1, 0, 0]);
      worldTransforms.set("b2", [1, 0, 0, 1, 50, 0]);

      const boneLengths = new Map<string, number>();
      boneLengths.set("b1", 50);
      boneLengths.set("b2", 50);

      const solution = solveIKController(controllers[0]!, worldTransforms, boneLengths);
      expect(solution.solvedAngles.size).toBe(0);
    });
  });
});
