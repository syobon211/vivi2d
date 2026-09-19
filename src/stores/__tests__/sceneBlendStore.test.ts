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
    it("既定・カスタム作成と全field/部分field更新で他blendを保持する", () => {
      const { createSceneBlend, updateSceneBlend } = useSceneBlendStore.getState();
      const id = createSceneBlend("scene-1" as never, "scene-2" as never);
      const defaults = { id, sourceSceneId: "scene-1", targetSceneId: "scene-2",
        mode: "crossfade", transitionFrames: 30, easing: "linear" };
      expect(id).toBeDefined();
      expect(useEditorStore.getState().project!.sceneBlends).toEqual([defaults]);
      const customId = createSceneBlend("scene-1" as never, "scene-2" as never, {
        mode: "additive", transitionFrames: 60, easing: "bezier",
      });
      const overrideId = createSceneBlend("scene-2" as never, "scene-1" as never, { mode: "override" });
      const created = useEditorStore.getState().project!.sceneBlends!;
      expect(created).toHaveLength(3);
      expect(created[1]).toEqual({
        id: customId, sourceSceneId: "scene-1", targetSceneId: "scene-2",
        mode: "additive", transitionFrames: 60, easing: "bezier",
      });
      expect(created[2]).toMatchObject({ id: overrideId, sourceSceneId: "scene-2",
        targetSceneId: "scene-1", mode: "override" });
      updateSceneBlend(id, { mode: "override", transitionFrames: 90, easing: "sns" });
      expect(useEditorStore.getState().project!.sceneBlends![0]).toEqual({
        ...defaults, mode: "override", transitionFrames: 90, easing: "sns",
      });
      updateSceneBlend(id, { mode: "additive" });
      expect(useEditorStore.getState().project!.sceneBlends![0]).toEqual({
        ...defaults, mode: "additive", transitionFrames: 90, easing: "sns",
      });
      updateSceneBlend(id, { transitionFrames: 120 });
      updateSceneBlend(id, { easing: "bezier" });
      expect(useEditorStore.getState().project!.sceneBlends![0]).toEqual({
        ...defaults, mode: "additive", transitionFrames: 120, easing: "bezier",
      });
      expect(useEditorStore.getState().project!.sceneBlends!.slice(1)).toEqual(created.slice(1));
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
