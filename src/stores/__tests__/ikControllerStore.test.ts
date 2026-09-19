import type { IKBoneConstraint, IKParameterMapping } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";

beforeEach(() => {
  resetEditorStore();
  resetHistoryStore();
});

const testBoneChain: IKBoneConstraint[] = [
  { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
  { boneId: "bone-2", minAngle: -Math.PI / 2, maxAngle: Math.PI / 2 },
];

function setup(overrides?: Parameters<typeof createProject>[0]) {
  const project = createProject({ ikControllers: [], ...overrides });
  useEditorStore.setState({ project });
  return useIKControllerStore.getState();
}

describe("ikControllerStore", () => {
  // ==============================================================
  // addIKController
  // ==============================================================
  describe("addIKController", () => {
    it("twoBoneとCCDの作成・編集・クランプ・mapping個別削除を保持する", () => {
      const actions = setup();
      const id = actions.addIKController("腕IK", "twoBone", testBoneChain);
      const get = () => useEditorStore.getState().project!.ikControllers!.find((ctrl) => ctrl.id === id)!;
      expect(useEditorStore.getState().project!.ikControllers).toHaveLength(1);
      expect(typeof id).toBe("string");
      expect(get()).toMatchObject({
        id, name: "腕IK", solverType: "twoBone", boneChain: testBoneChain,
        targetX: 0, targetY: 0, influence: 1, parameterMappings: [],
      });
      actions.setTarget(id, 100, 200);
      expect(get()).toMatchObject({ targetX: 100, targetY: 200 });
      actions.setPoleTarget(id, 50, -30);
      expect(get()).toMatchObject({ targetX: 100, targetY: 200, poleTargetX: 50, poleTargetY: -30 });
      actions.setInfluence(id, -0.5);
      expect(get().influence).toBe(0);
      actions.setInfluence(id, 1.5);
      expect(get().influence).toBe(1);
      const ccd = actions.addIKController("脚IK", "ccd", []);
      const getCcd = () => useEditorStore.getState().project!.ikControllers!.find((ctrl) => ctrl.id === ccd)!;
      expect(getCcd()).toMatchObject({ id: ccd, name: "脚IK", solverType: "ccd", boneChain: [] });
      actions.setMaxIterations(ccd, 0);
      expect(getCcd().maxIterations).toBe(1);
      actions.setMaxIterations(ccd, 5.7);
      expect(getCcd().maxIterations).toBe(6);
      const mapping: IKParameterMapping = {
        boneId: "bone-1", parameterId: "param-1",
        angleMin: -Math.PI, angleMax: Math.PI, paramMin: 0, paramMax: 1,
      };
      const other: IKParameterMapping = {
        boneId: "bone-2", parameterId: "param-2",
        angleMin: -2, angleMax: 2, paramMin: 0, paramMax: 1,
      };
      actions.addParameterMapping(id, mapping);
      expect(get().parameterMappings).toEqual([mapping]);
      actions.addParameterMapping(id, other);
      actions.removeParameterMapping(id, 0);
      expect(get().parameterMappings).toEqual([other]);
      expect(getCcd().parameterMappings).toEqual([]);
      expect(get()).toMatchObject({ targetX: 100, targetY: 200, poleTargetX: 50, poleTargetY: -30, influence: 1 });
    });


  });

  // ==============================================================
  // removeIKController
  // ==============================================================
  describe("removeIKController", () => {
    it("削除後に消える", () => {
      const actions = setup();
      const id = actions.addIKController("削除対象", "twoBone", []);

      actions.removeIKController(id);

      const project = useEditorStore.getState().project!;
      expect(project.ikControllers).toHaveLength(0);
    });

    it("存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      actions.addIKController("残る", "twoBone", []);

      expect(() => actions.removeIKController("non-existent")).not.toThrow();

      const project = useEditorStore.getState().project!;
      expect(project.ikControllers).toHaveLength(1);
    });
  });

  // ==============================================================
  // setTarget
  // ==============================================================

  // ==============================================================
  // setPoleTarget
  // ==============================================================

  // ==============================================================
  // setInfluence
  // ==============================================================

  // ==============================================================
  // setMaxIterations
  // ==============================================================

  // ==============================================================
  // addParameterMapping
  // ==============================================================

  // ==============================================================
  // removeParameterMapping
  // ==============================================================
  describe("removeParameterMapping", () => {


    it("範囲外インデックスでもクラッシュしない", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);

      expect(() => actions.removeParameterMapping(id, 99)).not.toThrow();
      expect(() => actions.removeParameterMapping(id, -1)).not.toThrow();
    });
  });

  describe("ikControllers が undefined の初期プロジェクト", () => {
    it("addIKController が正常に動作する", () => {
      const project = createProject();
      delete (project as unknown as Record<string, unknown>).ikControllers;
      useEditorStore.setState({ project });
      const actions = useIKControllerStore.getState();

      actions.addIKController("テスト", "twoBone", []);

      const updated = useEditorStore.getState().project!;
      expect(updated.ikControllers).toHaveLength(1);
    });

    it("removeIKController がクラッシュしない", () => {
      const project = createProject();
      delete (project as unknown as Record<string, unknown>).ikControllers;
      useEditorStore.setState({ project });
      const actions = useIKControllerStore.getState();

      expect(() => actions.removeIKController("any-id")).not.toThrow();
    });
  });

  describe("存在しないIDでの操作", () => {
    it("setTarget: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.setTarget("nonexistent", 10, 20)).not.toThrow();
    });

    it("setPoleTarget: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.setPoleTarget("nonexistent", 10, 20)).not.toThrow();
    });

    it("setInfluence: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.setInfluence("nonexistent", 0.5)).not.toThrow();
    });

    it("setMaxIterations: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.setMaxIterations("nonexistent", 10)).not.toThrow();
    });

    it("addParameterMapping: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() =>
        actions.addParameterMapping("nonexistent", {
          boneId: "b",
          parameterId: "p",
          angleMin: -1,
          angleMax: 1,
          paramMin: 0,
          paramMax: 1,
        }),
      ).not.toThrow();
    });

    it("removeParameterMapping: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.removeParameterMapping("nonexistent", 0)).not.toThrow();
    });
  });
});
