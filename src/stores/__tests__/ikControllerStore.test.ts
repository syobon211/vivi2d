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
    it("追加して project.ikControllers に反映される", () => {
      const actions = setup();

      const id = actions.addIKController("腕IK", "twoBone", testBoneChain);

      const project = useEditorStore.getState().project!;
      expect(project.ikControllers).toHaveLength(1);
      const ctrl = project.ikControllers![0]!;
      expect(ctrl.name).toBe("腕IK");
      expect(ctrl.solverType).toBe("twoBone");
      expect(ctrl.boneChain).toEqual(testBoneChain);
      expect(ctrl.targetX).toBe(0);
      expect(ctrl.targetY).toBe(0);
      expect(ctrl.influence).toBe(1);
      expect(ctrl.parameterMappings).toEqual([]);
      expect(typeof id).toBe("string");
    });

    it("返り値のIDが正しい", () => {
      const actions = setup();

      const id = actions.addIKController("脚IK", "ccd", []);

      const project = useEditorStore.getState().project!;
      expect(project.ikControllers![0]!.id).toBe(id);
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
  describe("setTarget", () => {
    it("ターゲット座標が更新される", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);

      actions.setTarget(id, 100, 200);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.targetX).toBe(100);
      expect(ctrl.targetY).toBe(200);
    });
  });

  // ==============================================================
  // setPoleTarget
  // ==============================================================
  describe("setPoleTarget", () => {
    it("ポールターゲットが更新される", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);

      actions.setPoleTarget(id, 50, -30);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.poleTargetX).toBe(50);
      expect(ctrl.poleTargetY).toBe(-30);
    });
  });

  // ==============================================================
  // setInfluence
  // ==============================================================
  describe("setInfluence", () => {
    it("0-1にクランプされる（負の値は0になる）", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);

      actions.setInfluence(id, -0.5);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.influence).toBe(0);
    });

    it("0-1にクランプされる（1を超える値は1になる）", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);

      actions.setInfluence(id, 1.5);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.influence).toBe(1);
    });
  });

  // ==============================================================
  // setMaxIterations
  // ==============================================================
  describe("setMaxIterations", () => {
    it("1未満は1にクランプされる", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "ccd", []);

      actions.setMaxIterations(id, 0);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.maxIterations).toBe(1);
    });

    it("正の値は整数に丸められる", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "ccd", []);

      actions.setMaxIterations(id, 5.7);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.maxIterations).toBe(6);
    });
  });

  // ==============================================================
  // addParameterMapping
  // ==============================================================
  describe("addParameterMapping", () => {
    it("マッピングが追加される", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", testBoneChain);
      const mapping: IKParameterMapping = {
        boneId: "bone-1",
        parameterId: "param-1",
        angleMin: -Math.PI,
        angleMax: Math.PI,
        paramMin: 0,
        paramMax: 1,
      };

      actions.addParameterMapping(id, mapping);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.parameterMappings).toHaveLength(1);
      expect(ctrl.parameterMappings[0]).toEqual(mapping);
    });
  });

  // ==============================================================
  // removeParameterMapping
  // ==============================================================
  describe("removeParameterMapping", () => {
    it("インデックス指定で削除する", () => {
      const actions = setup();
      const id = actions.addIKController("テスト", "twoBone", []);
      const mapping1: IKParameterMapping = {
        boneId: "bone-1",
        parameterId: "param-1",
        angleMin: -1,
        angleMax: 1,
        paramMin: 0,
        paramMax: 1,
      };
      const mapping2: IKParameterMapping = {
        boneId: "bone-2",
        parameterId: "param-2",
        angleMin: -2,
        angleMax: 2,
        paramMin: 0,
        paramMax: 1,
      };
      actions.addParameterMapping(id, mapping1);
      actions.addParameterMapping(id, mapping2);

      actions.removeParameterMapping(id, 0);

      const project = useEditorStore.getState().project!;
      const ctrl = project.ikControllers!.find((c) => c.id === id)!;
      expect(ctrl.parameterMappings).toHaveLength(1);
      expect(ctrl.parameterMappings[0]!.boneId).toBe("bone-2");
    });

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
