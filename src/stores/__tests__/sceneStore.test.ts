import { beforeEach, describe, expect, it } from "vitest";
import { _resetMergeTimer } from "@/stores/historyStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore } from "@/test/store-reset";
import { useEditorStore } from "../editorStore";
import { mutateScene } from "../projectMutator";
import { useSceneStore } from "../sceneStore";

function getScenes() {
  return useEditorStore.getState().project!.scenes;
}

beforeEach(() => {
  _resetMergeTimer();
  resetHistoryStore();
  resetEditorStore();
  useEditorStore.setState({
    project: createProject({ layers: [], scenes: [] }),
  });
});

describe("sceneStore", () => {
  it("シーンを作成できる", () => {
    const id = useSceneStore.getState().createScene("テストシーン");
    expect(id).toMatch(/\S/);
    const scenes = getScenes();
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.name).toBe("テストシーン");
    expect(scenes[0]!.clips).toEqual([]);
  });

  it("シーンを削除できる", () => {
    const id = useSceneStore.getState().createScene("削除対象");
    expect(getScenes()).toHaveLength(1);
    useSceneStore.getState().deleteScene(id);
    expect(getScenes()).toHaveLength(0);
  });

  it("シーンを複製できる", () => {
    const id = useSceneStore.getState().createScene("元シーン");
    const newId = useSceneStore.getState().duplicateScene(id);
    expect(newId).toMatch(/\S/);
    expect(newId).not.toBe(id);
    const scenes = getScenes();
    expect(scenes).toHaveLength(2);
    expect(scenes[1]!.name).toBe("元シーン (コピー)");
  });

  it("シーン名を変更できる", () => {
    const id = useSceneStore.getState().createScene("旧名");
    useSceneStore.getState().renameScene(id, "新名");
    expect(getScenes()[0]!.name).toBe("新名");
  });
});


describe("シーン管理 — エッジケース", () => {
  it("存在しないシーンを削除しても例外が発生しない", () => {
    useSceneStore.getState().createScene("残留シーン");
    expect(() => useSceneStore.getState().deleteScene("nonexistent")).not.toThrow();
    expect(getScenes()).toHaveLength(1);
  });

  it("存在しないシーンを複製しても例外が発生しない", () => {
    useSceneStore.getState().createScene("残留シーン");
    expect(() => useSceneStore.getState().duplicateScene("nonexistent")).not.toThrow();
    expect(getScenes()).toHaveLength(1);
  });

  it("存在しないシーンの名前を変更しても例外が発生しない", () => {
    useSceneStore.getState().createScene("残留シーン");
    expect(() =>
      useSceneStore.getState().renameScene("nonexistent", "新名"),
    ).not.toThrow();
    expect(getScenes()[0]!.name).toBe("残留シーン");
  });

  it("複製シーンはクリップも含めてディープコピーされる", () => {
    const sceneId = useSceneStore.getState().createScene("元シーン");

    mutateScene(sceneId, (scene) => {
      scene.clips.push({
        id: "clip-1",
        name: "テストクリップ",
        duration: 60,
        fps: 30,
        tracks: [
          {
            parameterId: "param1",
            keyframes: [{ frame: 0, value: 10, interpolation: "linear" as const }],
          },
        ],
      });
    });

    const newId = useSceneStore.getState().duplicateScene(sceneId);
    const scenes = getScenes();
    expect(scenes).toHaveLength(2);

    const original = scenes.find((s) => s.id === sceneId)!;
    const copy = scenes.find((s) => s.id === newId)!;

    expect(copy.clips).toHaveLength(1);
    expect(copy.clips[0]!.name).toBe("テストクリップ");
    expect(copy.clips[0]!.duration).toBe(60);

    expect(copy.clips[0]!.id).not.toBe(original.clips[0]!.id);

    expect(copy.clips[0]!.tracks).toHaveLength(1);
    expect(copy.clips[0]!.tracks[0]!.parameterId).toBe("param1");
    expect(copy.clips[0]!.tracks[0]!.keyframes).toHaveLength(1);
    expect(copy.clips[0]!.tracks[0]!.keyframes[0]!.value).toBe(10);

    expect(copy.clips[0]!.tracks[0]!.keyframes[0]).not.toBe(
      original.clips[0]!.tracks[0]!.keyframes[0],
    );
  });
});
