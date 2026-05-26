import { beforeEach, describe, expect, it } from "vitest";
import { setupTestProject } from "@/test/helpers";
import { useEditorStore } from "../editorStore";
import { useSceneBlendStore } from "../sceneBlendStore";


describe("sceneBlendStore", () => {
  beforeEach(() => {
    setupTestProject({
      scenes: [
        { id: "scene-1", name: "シーン1", clips: [] },
        { id: "scene-2", name: "シーン2", clips: [] },
      ],
    });
  });

  describe("createSceneBlend", () => {
    it("デフォルト設定でシーンブレンドを作成する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);

      expect(blendId).toBeDefined();
      const project = useEditorStore.getState().project!;
      expect(project.sceneBlends).toBeDefined();
      expect(project.sceneBlends!.length).toBe(1);

      const blend = project.sceneBlends![0]!;
      expect(blend.id).toBe(blendId);
      expect(blend.sourceSceneId).toBe("scene-1");
      expect(blend.targetSceneId).toBe("scene-2");
      expect(blend.mode).toBe("crossfade");
      expect(blend.transitionFrames).toBe(30);
      expect(blend.easing).toBe("linear");
    });

    it("カスタム設定でシーンブレンドを作成する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never, {
          mode: "additive",
          transitionFrames: 60,
          easing: "bezier",
        });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.id).toBe(blendId);
      expect(blend.mode).toBe("additive");
      expect(blend.transitionFrames).toBe(60);
      expect(blend.easing).toBe("bezier");
    });

    it("複数のシーンブレンドを作成できる", () => {
      useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore
        .getState()
        .createSceneBlend("scene-2" as never, "scene-1" as never, {
          mode: "override",
        });

      const blends = useEditorStore.getState().project!.sceneBlends!;
      expect(blends.length).toBe(2);
      expect(blends[0]!.mode).toBe("crossfade");
      expect(blends[1]!.mode).toBe("override");
    });

    it("returns an empty id when no project is loaded", () => {
      useEditorStore.setState({ project: null });

      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);

      expect(blendId).toBe("");
    });
  });

  describe("removeSceneBlend", () => {
    it("シーンブレンドを削除する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      expect(useEditorStore.getState().project!.sceneBlends!.length).toBe(1);

      useSceneBlendStore.getState().removeSceneBlend(blendId);
      expect(useEditorStore.getState().project!.sceneBlends!.length).toBe(0);
    });

    it("存在しないIDで呼んでもエラーにならない", () => {
      useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      expect(() =>
        useSceneBlendStore.getState().removeSceneBlend("nonexistent"),
      ).not.toThrow();
      expect(useEditorStore.getState().project!.sceneBlends!.length).toBe(1);
    });

    it("sceneBlends が未初期化でもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) (s.project as Record<string, unknown>).sceneBlends = undefined;
      });
      expect(() => useSceneBlendStore.getState().removeSceneBlend("x")).not.toThrow();
    });
  });

  describe("updateSceneBlend", () => {
    it("モードを更新する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore.getState().updateSceneBlend(blendId, { mode: "additive" });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.mode).toBe("additive");
    });

    it("遷移フレーム数を更新する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore.getState().updateSceneBlend(blendId, { transitionFrames: 120 });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.transitionFrames).toBe(120);
    });

    it("イージングを更新する", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore.getState().updateSceneBlend(blendId, { easing: "bezier" });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.easing).toBe("bezier");
    });

    it("複数フィールドを同時に更新できる", () => {
      const blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore.getState().updateSceneBlend(blendId, {
        mode: "override",
        transitionFrames: 90,
        easing: "sns",
      });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.mode).toBe("override");
      expect(blend.transitionFrames).toBe(90);
      expect(blend.easing).toBe("sns");
    });

    it("存在しないIDでは変更しない", () => {
      const _blendId = useSceneBlendStore
        .getState()
        .createSceneBlend("scene-1" as never, "scene-2" as never);
      useSceneBlendStore.getState().updateSceneBlend("nonexistent", { mode: "additive" });

      const blend = useEditorStore.getState().project!.sceneBlends![0]!;
      expect(blend.mode).toBe("crossfade");
    });

    it("sceneBlends が未初期化でもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) (s.project as Record<string, unknown>).sceneBlends = undefined;
      });
      expect(() =>
        useSceneBlendStore.getState().updateSceneBlend("x", { mode: "additive" }),
      ).not.toThrow();
    });
  });
});
