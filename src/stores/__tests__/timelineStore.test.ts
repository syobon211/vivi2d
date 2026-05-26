import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetSelectionStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { useClipStore } from "../clipStore";
import { useEditorStore } from "../editorStore";
import { useTimelineStore } from "../timelineStore";

function resetStores() {
  resetEditorStore();
  resetSelectionStore();
  resetTimelineStore();
  useEditorStore.setState({
    project: createEmptyProject(),
    projectVersion: 1,
  });
}

function createAndActivateClip(name = "テスト"): string {
  const id = useClipStore.getState().createClip(name);
  useTimelineStore.getState().setActiveClip(id);
  return id;
}

describe("timelineStore（再生専用）", () => {
  beforeEach(resetStores);
  afterEach(resetStores);


  describe("play / pause / stop", () => {
    it("クリップがない場合は再生しない", () => {
      useTimelineStore.getState().play();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });

    it("play で再生開始", () => {
      createAndActivateClip();
      useTimelineStore.getState().play();
      expect(useTimelineStore.getState().isPlaying).toBe(true);
    });

    it("pause で一時停止", () => {
      createAndActivateClip();
      useTimelineStore.getState().play();
      useTimelineStore.getState().pause();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });

    it("stop でフレーム0に戻す", () => {
      createAndActivateClip();
      useTimelineStore.getState().seekTo(30);
      useTimelineStore.getState().play();
      useTimelineStore.getState().stop();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      expect(useTimelineStore.getState().currentFrame).toBe(0);
    });

    it("togglePlay で再生/停止をトグルする", () => {
      createAndActivateClip();
      useTimelineStore.getState().togglePlay();
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      useTimelineStore.getState().togglePlay();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });

    it("終端にいる場合、play で先頭に戻す", () => {
      createAndActivateClip();
      useTimelineStore.getState().seekTo(89); // duration-1
      useTimelineStore.getState().play();
      expect(useTimelineStore.getState().currentFrame).toBe(0);
      expect(useTimelineStore.getState().isPlaying).toBe(true);
    });
  });

  describe("seekTo", () => {
    it("指定フレームに移動する", () => {
      createAndActivateClip();
      useTimelineStore.getState().seekTo(45);
      expect(useTimelineStore.getState().currentFrame).toBe(45);
    });

    it("範囲外はクランプされる", () => {
      createAndActivateClip();
      useTimelineStore.getState().seekTo(-5);
      expect(useTimelineStore.getState().currentFrame).toBe(0);
      useTimelineStore.getState().seekTo(200);
      expect(useTimelineStore.getState().currentFrame).toBe(89);
    });

    it("小数フレームは丸められる", () => {
      createAndActivateClip();
      useTimelineStore.getState().seekTo(10.7);
      expect(useTimelineStore.getState().currentFrame).toBe(11);
    });
  });

  describe("advanceFrame", () => {
    it("フレームを1つ進める", () => {
      createAndActivateClip();
      useTimelineStore.getState().play();
      const result = useTimelineStore.getState().advanceFrame();
      expect(result).toBe(true);
      expect(useTimelineStore.getState().currentFrame).toBe(1);
    });

    it("終端に到達すると再生を停止し false を返す", () => {
      createAndActivateClip();
      useTimelineStore.setState({ isPlaying: true, currentFrame: 89 });
      const result = useTimelineStore.getState().advanceFrame();
      expect(result).toBe(false);
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      expect(useTimelineStore.getState().currentFrame).toBe(89);
    });

    it("ループ有効時は先頭に戻り true を返す", () => {
      createAndActivateClip();
      useTimelineStore.getState().setLooping(true);
      useTimelineStore.setState({ isPlaying: true, currentFrame: 89 });
      const result = useTimelineStore.getState().advanceFrame();
      expect(result).toBe(true);
      expect(useTimelineStore.getState().currentFrame).toBe(0);
      expect(useTimelineStore.getState().isPlaying).toBe(true);
    });

    it("再生中でない場合は何もしない", () => {
      createAndActivateClip();
      useTimelineStore.getState().advanceFrame();
      expect(useTimelineStore.getState().currentFrame).toBe(0);
    });
  });

  describe("setLooping", () => {
    it("ループフラグを設定する", () => {
      useTimelineStore.getState().setLooping(true);
      expect(useTimelineStore.getState().isLooping).toBe(true);
      useTimelineStore.getState().setLooping(false);
      expect(useTimelineStore.getState().isLooping).toBe(false);
    });
  });

  describe("setActiveClip", () => {
    it("アクティブクリップを切り替えてフレームをリセットする", () => {
      const id1 = useClipStore.getState().createClip("クリップ1");
      const _id2 = useClipStore.getState().createClip("クリップ2");
      useTimelineStore.getState().setActiveClip(_id2);
      useTimelineStore.getState().seekTo(30);
      useTimelineStore.getState().setActiveClip(id1);

      expect(useTimelineStore.getState().activeClipId).toBe(id1);
      expect(useTimelineStore.getState().currentFrame).toBe(0);
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });

    it("null を設定するとクリップ未選択になる", () => {
      createAndActivateClip();
      useTimelineStore.getState().setActiveClip(null);
      expect(useTimelineStore.getState().activeClipId).toBeNull();
    });
  });
});

describe("editorStore クリップ CRUD（timelineStore から統合）", () => {
  beforeEach(resetStores);
  afterEach(resetStores);


  describe("createClip", () => {
    it("新しいクリップを作成し project.clips に追加する", () => {
      const id = useClipStore.getState().createClip("テスト");
      expect(id).toBeDefined();

      const clips = useEditorStore.getState().project!.clips;
      expect(clips).toHaveLength(1);
      expect(clips[0]!.name).toBe("テスト");
      expect(clips[0]!.duration).toBe(90);
      expect(clips[0]!.fps).toBe(30);
      expect(clips[0]!.tracks).toEqual([]);
    });
  });

  describe("deleteClip", () => {
    it("クリップを削除する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().deleteClip(id);
      expect(useEditorStore.getState().project!.clips).toHaveLength(0);
    });
  });

  describe("renameClip", () => {
    it("クリップ名を変更する", () => {
      const id = useClipStore.getState().createClip("旧名");
      useClipStore.getState().renameClip(id, "新名");
      expect(useEditorStore.getState().project!.clips[0]!.name).toBe("新名");
    });
  });

  describe("setClipDuration", () => {
    it("クリップの長さを変更する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipDuration(id, 120);
      expect(useEditorStore.getState().project!.clips[0]!.duration).toBe(120);
    });

    it("最小値にクランプされる", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipDuration(id, 0);
      expect(useEditorStore.getState().project!.clips[0]!.duration).toBe(1);
    });
  });

  describe("setClipFps", () => {
    it("クリップのFPSを変更する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipFps(id, 60);
      expect(useEditorStore.getState().project!.clips[0]!.fps).toBe(60);
    });

    it("範囲外はクランプされる", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipFps(id, 0);
      expect(useEditorStore.getState().project!.clips[0]!.fps).toBe(1);
      useClipStore.getState().setClipFps(id, 999);
      expect(useEditorStore.getState().project!.clips[0]!.fps).toBe(120);
    });
  });


  describe("addTrack / removeTrack", () => {
    it("トラックを追加する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addTrack(id, "param1");

      const clip = useEditorStore.getState().project!.clips[0]!;
      expect(clip.tracks).toHaveLength(1);
      expect(clip.tracks[0]!.parameterId).toBe("param1");
      expect(clip.tracks[0]!.keyframes).toEqual([]);
    });

    it("同じパラメータIDのトラックは重複追加しない", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addTrack(id, "param1");
      useClipStore.getState().addTrack(id, "param1");

      expect(useEditorStore.getState().project!.clips[0]!.tracks).toHaveLength(1);
    });

    it("トラックを削除する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addTrack(id, "param1");
      useClipStore.getState().removeTrack(id, "param1");

      expect(useEditorStore.getState().project!.clips[0]!.tracks).toHaveLength(0);
    });
  });


  describe("addKeyframe", () => {
    it("キーフレームを追加する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addTrack(id, "param1");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);

      const kfs = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes;
      expect(kfs).toHaveLength(1);
      expect(kfs[0]!).toEqual({ frame: 0, value: 10, interpolation: "linear" });
    });

    it("キーフレームをフレーム昇順でソートする", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 20, 100);
      useClipStore.getState().addKeyframe(id, "param1", 0, 0);
      useClipStore.getState().addKeyframe(id, "param1", 10, 50);

      const kfs = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes;
      expect(kfs.map((k) => k.frame)).toEqual([0, 10, 20]);
    });

    it("同じフレームのキーフレームは上書きする", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 5, 10);
      useClipStore.getState().addKeyframe(id, "param1", 5, 99);

      const kfs = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes;
      expect(kfs).toHaveLength(1);
      expect(kfs[0]!.value).toBe(99);
    });

    it("トラックが存在しない場合は自動作成する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 5);

      const clip = useEditorStore.getState().project!.clips[0]!;
      expect(clip.tracks).toHaveLength(1);
      expect(clip.tracks[0]!.parameterId).toBe("param1");
    });

    it("補間タイプを指定できる", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 0, "step");

      const kf = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes[0]!;
      expect(kf.interpolation).toBe("step");
    });
  });

  describe("removeKeyframe", () => {
    it("キーフレームを削除する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);
      useClipStore.getState().addKeyframe(id, "param1", 10, 50);
      useClipStore.getState().removeKeyframe(id, "param1", 0);

      const kfs = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes;
      expect(kfs).toHaveLength(1);
      expect(kfs[0]!.frame).toBe(10);
    });
  });

  describe("updateKeyframe", () => {
    it("キーフレームの値を更新する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);
      useClipStore.getState().updateKeyframe(id, "param1", 0, { value: 99 });

      const kf = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes[0]!;
      expect(kf.value).toBe(99);
    });

    it("キーフレームの補間タイプを更新する", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);
      useClipStore.getState().updateKeyframe(id, "param1", 0, {
        interpolation: "bezier",
      });

      const kf = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes[0]!;
      expect(kf.interpolation).toBe("bezier");
    });

    it("存在しないフレームの更新は何もしない", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);
      useClipStore.getState().updateKeyframe(id, "param1", 99, { value: 0 });

      const kf = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes[0]!;
      expect(kf.value).toBe(10);
    });

    it("存在しないトラックの更新は何もしない", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);

      expect(() =>
        useClipStore.getState().updateKeyframe(id, "nonexistent", 0, { value: 0 }),
      ).not.toThrow();

      const kf = useEditorStore.getState().project!.clips[0]!.tracks[0]!.keyframes[0]!;
      expect(kf.value).toBe(10);
    });
  });

  describe("removeKeyframe — エッジケース", () => {
    it("存在しないトラックからの削除は何もしない", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().addKeyframe(id, "param1", 0, 10);

      expect(() =>
        useClipStore.getState().removeKeyframe(id, "nonexistent", 0),
      ).not.toThrow();

      expect(useEditorStore.getState().project!.clips[0]!.tracks).toHaveLength(1);
    });
  });

  describe("setClipDuration — エッジケース", () => {
    it("最大値を超える場合はクランプされる", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipDuration(id, 99999);
      expect(useEditorStore.getState().project!.clips[0]!.duration).toBe(9999);
    });

    it("小数値は丸められる", () => {
      const id = useClipStore.getState().createClip("テスト");
      useClipStore.getState().setClipDuration(id, 45.7);
      expect(useEditorStore.getState().project!.clips[0]!.duration).toBe(46);
    });
  });
});


describe("viewMode と selectedGraphTrack", () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it("setViewMode でドープシートとグラフエディタを切り替える", () => {
    useTimelineStore.getState().setViewMode("graphEditor");
    expect(useTimelineStore.getState().viewMode).toBe("graphEditor");

    useTimelineStore.getState().setViewMode("dopeSheet");
    expect(useTimelineStore.getState().viewMode).toBe("dopeSheet");
  });

  it("setSelectedGraphTrack でトラックを選択/解除する", () => {
    useTimelineStore.getState().setSelectedGraphTrack("track-1");
    expect(useTimelineStore.getState().selectedGraphTrackId).toBe("track-1");

    useTimelineStore.getState().setSelectedGraphTrack(null);
    expect(useTimelineStore.getState().selectedGraphTrackId).toBeNull();
  });

  it("初期値はdopeSheetとnull", () => {
    expect(useTimelineStore.getState().viewMode).toBe("dopeSheet");
    expect(useTimelineStore.getState().selectedGraphTrackId).toBeNull();
  });
});

// ============================================================
// setActiveScene
// ============================================================

describe("seekTo — プロジェクトなし/クリップなし", () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it("プロジェクトが null の場合 seekTo はフレーム0にクランプされる", () => {
    useEditorStore.setState({ project: null });
    useTimelineStore.getState().setActiveClip("nonexistent");
    useTimelineStore.getState().seekTo(50);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("アクティブクリップが存在しない場合 seekTo はフレーム0にクランプされる", () => {
    useTimelineStore.getState().setActiveClip("nonexistent-id");
    useTimelineStore.getState().seekTo(100);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("activeClipId が null の場合 seekTo はフレーム0にクランプされる", () => {
    useTimelineStore.getState().setActiveClip(null);
    useTimelineStore.getState().seekTo(50);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });
});

describe("setActiveScene", () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it("シーンを切り替えるとクリップとフレームがリセットされる", () => {
    createAndActivateClip();
    useTimelineStore.getState().seekTo(30);
    expect(useTimelineStore.getState().currentFrame).toBe(30);
    expect(useTimelineStore.getState().activeClipId).not.toBeNull();

    useTimelineStore.getState().setActiveScene("scene-1");

    expect(useTimelineStore.getState().activeSceneId).toBe("scene-1");
    expect(useTimelineStore.getState().activeClipId).toBeNull();
    expect(useTimelineStore.getState().currentFrame).toBe(0);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it("null でシーン未選択にできる", () => {
    useTimelineStore.getState().setActiveScene("scene-1");
    expect(useTimelineStore.getState().activeSceneId).toBe("scene-1");

    useTimelineStore.getState().setActiveScene(null);
    expect(useTimelineStore.getState().activeSceneId).toBeNull();
  });
});
