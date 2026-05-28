import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useOffscreenStore } from "@/stores/offscreenStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";

beforeEach(() => {
  resetEditorStore();
  resetHistoryStore();
});

function setup(overrides?: Parameters<typeof createProject>[0]) {
  const project = createProject({ offscreenTargets: [], ...overrides });
  useEditorStore.setState({ project });
  return useOffscreenStore.getState();
}

describe("offscreenStore", () => {
  // ==============================================================
  // addOffscreenTarget
  // ==============================================================
  describe("addOffscreenTarget", () => {
    it("追加して project.offscreenTargets に反映される", () => {
      const actions = setup();

      const id = actions.addOffscreenTarget(256, 512);

      const project = useEditorStore.getState().project!;
      expect(project.offscreenTargets).toHaveLength(1);
      const target = project.offscreenTargets![0]!;
      expect(target.id).toBe(id);
      expect(target.width).toBe(256);
      expect(target.height).toBe(512);
      expect(target.sourceLayerIds).toEqual([]);
      expect(typeof id).toBe("string");
    });

    it("returns an empty id when no project is loaded", () => {
      const actions = useOffscreenStore.getState();

      expect(actions.addOffscreenTarget(256, 256)).toBe("");
    });

    it("ignores no-project mutations without throwing", () => {
      const actions = useOffscreenStore.getState();

      expect(() => actions.removeOffscreenTarget("missing")).not.toThrow();
      expect(() => actions.addSourceLayer("missing", "layer-1")).not.toThrow();
      expect(() => actions.removeSourceLayer("missing", "layer-1")).not.toThrow();
      expect(() => actions.setBufferSize("missing", 256, 256)).not.toThrow();
    });
  });

  // ==============================================================
  // removeOffscreenTarget
  // ==============================================================
  describe("removeOffscreenTarget", () => {
    it("削除後に消える", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(128, 128);

      actions.removeOffscreenTarget(id);

      const project = useEditorStore.getState().project!;
      expect(project.offscreenTargets).toHaveLength(0);
    });
  });

  // ==============================================================
  // addSourceLayer
  // ==============================================================
  describe("addSourceLayer", () => {
    it("ソースレイヤーを追加する", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(256, 256);

      actions.addSourceLayer(id, "layer-1");

      const project = useEditorStore.getState().project!;
      const target = project.offscreenTargets!.find((t) => t.id === id)!;
      expect(target.sourceLayerIds).toEqual(["layer-1"]);
    });

    it("重複IDは追加されない", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(256, 256);
      actions.addSourceLayer(id, "layer-1");

      actions.addSourceLayer(id, "layer-1");

      const project = useEditorStore.getState().project!;
      const target = project.offscreenTargets!.find((t) => t.id === id)!;
      expect(target.sourceLayerIds).toEqual(["layer-1"]);
      expect(target.sourceLayerIds).toHaveLength(1);
    });
  });

  // ==============================================================
  // removeSourceLayer
  // ==============================================================
  describe("removeSourceLayer", () => {
    it("ソースレイヤーを削除する", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(256, 256);
      actions.addSourceLayer(id, "layer-1");
      actions.addSourceLayer(id, "layer-2");

      actions.removeSourceLayer(id, "layer-1");

      const project = useEditorStore.getState().project!;
      const target = project.offscreenTargets!.find((t) => t.id === id)!;
      expect(target.sourceLayerIds).toEqual(["layer-2"]);
    });
  });

  // ==============================================================
  // setBufferSize
  // ==============================================================
  describe("setBufferSize", () => {
    it("サイズが変更される（整数に丸められる）", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(256, 256);

      actions.setBufferSize(id, 512.7, 128.3);

      const project = useEditorStore.getState().project!;
      const target = project.offscreenTargets!.find((t) => t.id === id)!;
      expect(target.width).toBe(513);
      expect(target.height).toBe(128);
    });

    it("0以下は1にクランプされる", () => {
      const actions = setup();
      const id = actions.addOffscreenTarget(256, 256);

      actions.setBufferSize(id, 0, -5);

      const project = useEditorStore.getState().project!;
      const target = project.offscreenTargets!.find((t) => t.id === id)!;
      expect(target.width).toBe(1);
      expect(target.height).toBe(1);
    });
  });

  describe("offscreenTargets が undefined の初期プロジェクト", () => {
    it("addOffscreenTarget が正常に動作する", () => {
      const project = createProject();
      delete (project as unknown as Record<string, unknown>).offscreenTargets;
      useEditorStore.setState({ project });
      const actions = useOffscreenStore.getState();

      actions.addOffscreenTarget(256, 256);

      const updated = useEditorStore.getState().project!;
      expect(updated.offscreenTargets).toHaveLength(1);
    });

    it("removeOffscreenTarget がクラッシュしない", () => {
      const project = createProject();
      delete (project as unknown as Record<string, unknown>).offscreenTargets;
      useEditorStore.setState({ project });
      const actions = useOffscreenStore.getState();

      expect(() => actions.removeOffscreenTarget("any-id")).not.toThrow();
    });
  });

  describe("存在しないターゲットIDでの操作", () => {
    it("addSourceLayer: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.addSourceLayer("nonexistent", "layer-1")).not.toThrow();
    });

    it("removeSourceLayer: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.removeSourceLayer("nonexistent", "layer-1")).not.toThrow();
    });

    it("setBufferSize: 存在しないIDでもクラッシュしない", () => {
      const actions = setup();
      expect(() => actions.setBufferSize("nonexistent", 256, 256)).not.toThrow();
    });
  });
});
