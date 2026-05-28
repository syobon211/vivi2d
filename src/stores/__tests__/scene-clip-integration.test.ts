import { EASING_PRESETS, TIMELINE_DEFAULTS } from "@vivi2d/core/constants";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSceneStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { useClipStore } from "../clipStore";
import { useEditorStore } from "../editorStore";
import { useSceneStore } from "../sceneStore";
import { useTimelineStore } from "../timelineStore";


function createAndActivateScene(name: string): string {
  const id = useSceneStore.getState().createScene(name);
  useTimelineStore.getState().setActiveScene(id);
  return id;
}

function getSceneClips(sceneId: string) {
  const project = useEditorStore.getState().project!;
  const scene = project.scenes.find((s) => s.id === sceneId);
  return scene?.clips ?? [];
}

function getScenes() {
  return useEditorStore.getState().project!.scenes;
}


beforeEach(() => {
  resetEditorStore();
  resetTimelineStore();
  resetHistoryStore();
  resetSceneStore();
  useEditorStore.setState({ project: createProject({ scenes: [], clips: [] }) });
});


describe("シーン → クリップ → タイムライン統合テスト", () => {
  it("シーンを作成しアクティブにしてからクリップを作成すると、シーン内のclipsに追加される", () => {
    const sceneId = createAndActivateScene("シーンA");

    const clipId = useClipStore.getState().createClip("モーション1");

    const clips = getSceneClips(sceneId);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.id).toBe(clipId);
    expect(clips[0]!.name).toBe("モーション1");
    expect(clips[0]!.duration).toBe(TIMELINE_DEFAULTS.DURATION);
    expect(clips[0]!.fps).toBe(TIMELINE_DEFAULTS.FPS);
  });

  it("シーン切替でクリップ選択とフレームがリセットされる", () => {
    createAndActivateScene("シーンA");
    const clipA = useClipStore.getState().createClip("クリップA");

    useTimelineStore.getState().setActiveClip(clipA);
    useTimelineStore.getState().seekTo(15);
    expect(useTimelineStore.getState().activeClipId).toBe(clipA);
    expect(useTimelineStore.getState().currentFrame).toBe(15);

    const sceneB = createAndActivateScene("シーンB");

    expect(useTimelineStore.getState().activeSceneId).toBe(sceneB);
    expect(useTimelineStore.getState().activeClipId).toBeNull();
    expect(useTimelineStore.getState().currentFrame).toBe(0);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it("シーン削除後に含まれていたクリップにアクセスできない", () => {
    const sceneId = createAndActivateScene("削除対象シーン");

    const clipId1 = useClipStore.getState().createClip("クリップ1");
    const clipId2 = useClipStore.getState().createClip("クリップ2");
    expect(getSceneClips(sceneId)).toHaveLength(2);

    useSceneStore.getState().deleteScene(sceneId);

    const scene = getScenes().find((s) => s.id === sceneId);
    expect(scene).toBeUndefined();

    const allClipsInScenes = getScenes().flatMap((s) => s.clips);
    expect(allClipsInScenes.find((c) => c.id === clipId1)).toBeUndefined();
    expect(allClipsInScenes.find((c) => c.id === clipId2)).toBeUndefined();
  });

  it("シーン複製時に元シーンのクリップも複製される", () => {
    const sceneId = createAndActivateScene("元シーン");

    const clipId = useClipStore.getState().createClip("歩行モーション");
    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 0, -30);
    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 30, 30);

    const newSceneId = useSceneStore.getState().duplicateScene(sceneId);

    const newClips = getSceneClips(newSceneId);
    expect(newClips).toHaveLength(1);
    expect(newClips[0]!.name).toBe("歩行モーション");

    expect(newClips[0]!.id).not.toBe(clipId);

    const track = newClips[0]!.tracks.find((t) => t.parameterId === "ParamAngleX");
    expect(track).toBeDefined();
    expect(track!.keyframes).toHaveLength(2);
    expect(track!.keyframes[0]!.value).toBe(-30);
    expect(track!.keyframes[1]!.value).toBe(30);
  });

  it("複数シーン間でのクリップ独立性（一方の変更が他方に影響しない）", () => {
    const sceneA = createAndActivateScene("シーンA");
    const clipA = useClipStore.getState().createClip("クリップA");
    useClipStore.getState().addKeyframe(clipA, "ParamAngleX", 0, 10);

    const sceneB = useSceneStore.getState().duplicateScene(sceneA);
    const clipBId = getSceneClips(sceneB)[0]!.id;

    useClipStore.getState().addKeyframe(clipA, "ParamAngleX", 15, 50);

    const clipBTrack = getSceneClips(sceneB)[0]!.tracks.find(
      (t) => t.parameterId === "ParamAngleX",
    );
    expect(clipBTrack!.keyframes).toHaveLength(1);
    expect(clipBTrack!.keyframes[0]!.value).toBe(10);

    useClipStore.getState().updateKeyframe(clipBId, "ParamAngleX", 0, {
      value: 99,
    });

    const clipATrack = getSceneClips(sceneA)[0]!.tracks.find(
      (t) => t.parameterId === "ParamAngleX",
    );
    expect(clipATrack!.keyframes[0]!.value).toBe(10);
  });

  it("シーン内クリップでキーフレーム追加→再生→フレーム進行の一連操作", () => {
    createAndActivateScene("再生テストシーン");
    const clipId = useClipStore.getState().createClip("再生テスト");

    useTimelineStore.getState().setActiveClip(clipId);

    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 0, 0, "linear");
    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 30, 100, "linear");

    useTimelineStore.getState().play();
    expect(useTimelineStore.getState().isPlaying).toBe(true);
    expect(useTimelineStore.getState().currentFrame).toBe(0);

    const continued1 = useTimelineStore.getState().advanceFrame();
    expect(continued1).toBe(true);
    expect(useTimelineStore.getState().currentFrame).toBe(1);

    for (let i = 0; i < 10; i++) {
      useTimelineStore.getState().advanceFrame();
    }
    expect(useTimelineStore.getState().currentFrame).toBe(11);

    useTimelineStore.getState().seekTo(25);
    expect(useTimelineStore.getState().currentFrame).toBe(25);

    useTimelineStore.getState().stop();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("グラフエディタモードでイージングプリセット適用がキーフレームに反映される", () => {
    const sceneId = createAndActivateScene("グラフエディタテスト");
    const clipId = useClipStore.getState().createClip("イージングテスト");

    useTimelineStore.getState().setActiveClip(clipId);

    useTimelineStore.getState().setViewMode("graphEditor");
    expect(useTimelineStore.getState().viewMode).toBe("graphEditor");

    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 0, 0, "linear");
    useClipStore.getState().addKeyframe(clipId, "ParamAngleX", 30, 100, "linear");

    useTimelineStore.getState().setSelectedGraphTrack("ParamAngleX");
    expect(useTimelineStore.getState().selectedGraphTrackId).toBe("ParamAngleX");

    useClipStore.getState().applyEasingPreset(clipId, "ParamAngleX", 0, "easeInOut");

    const scene = getScenes().find((s) => s.id === sceneId)!;
    const track = scene.clips[0]!.tracks.find((t) => t.parameterId === "ParamAngleX")!;
    const kf = track.keyframes[0]!;

    expect(kf.interpolation).toBe("bezier");
    expect(kf.cp1x).toBe(EASING_PRESETS.easeInOut.cp1x);
    expect(kf.cp1y).toBe(EASING_PRESETS.easeInOut.cp1y);
    expect(kf.cp2x).toBe(EASING_PRESETS.easeInOut.cp2x);
    expect(kf.cp2y).toBe(EASING_PRESETS.easeInOut.cp2y);

    useClipStore.getState().applyEasingPreset(clipId, "ParamAngleX", 0, "easeIn");

    const kf2 = getScenes()
      .find((s) => s.id === sceneId)!
      .clips[0]!.tracks.find((t) => t.parameterId === "ParamAngleX")!.keyframes[0]!;

    expect(kf2.cp1x).toBe(EASING_PRESETS.easeIn.cp1x);
    expect(kf2.cp1y).toBe(EASING_PRESETS.easeIn.cp1y);
    expect(kf2.cp2x).toBe(EASING_PRESETS.easeIn.cp2x);
    expect(kf2.cp2y).toBe(EASING_PRESETS.easeIn.cp2y);
  });
});
