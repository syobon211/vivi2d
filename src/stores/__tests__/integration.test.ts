import { evaluateClipAtFrame } from "@vivi2d/core/timeline-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { closeProject, loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createViviMesh, createEmptyProject, createPhysicsGroup } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";


const resetAllStoresWithInactive = () => {
  resetAllStores();
  usePhysicsStore.setState({ isActive: false });
};

function setupProjectWithParameter() {
  const layer = createViviMesh({ name: "テスト" });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [layer],
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "角度Y", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
    },
    projectVersion: 1,
  });
  return layer.id;
}


describe("エディタ → クリップ → タイムライン 統合", () => {
  beforeEach(resetAllStoresWithInactive);
  afterEach(resetAllStoresWithInactive);

  it("パラメータ追加 → クリップ作成 → キーフレーム設定 → 評価の一連フロー", () => {
    setupProjectWithParameter();

    const clipId = useClipStore.getState().createClip("歩き");
    expect(useEditorStore.getState().project!.clips).toHaveLength(1);

    useTimelineStore.getState().setActiveClip(clipId);
    expect(useTimelineStore.getState().activeClipId).toBe(clipId);

    useClipStore.getState().addKeyframe(clipId, "p1", 0, -30);
    useClipStore.getState().addKeyframe(clipId, "p1", 44, 0);
    useClipStore.getState().addKeyframe(clipId, "p1", 89, 30);

    const clip = useEditorStore.getState().project!.clips[0]!;
    expect(evaluateClipAtFrame(clip, 0).p1).toBe(-30);
    expect(evaluateClipAtFrame(clip, 44).p1).toBe(0);
    expect(evaluateClipAtFrame(clip, 89).p1).toBe(30);

    const v22 = evaluateClipAtFrame(clip, 22);
    expect(v22.p1).toBeCloseTo(-30 + 30 * (22 / 44), 1);
  });

  it("クリップ削除でタイムラインが正しくリセットされる", () => {
    setupProjectWithParameter();

    const clipId = useClipStore.getState().createClip("一時クリップ");
    useTimelineStore.getState().setActiveClip(clipId);
    useTimelineStore.getState().play();
    useTimelineStore.setState({ currentFrame: 30 });

    useClipStore.getState().deleteClip(clipId);

    expect(useEditorStore.getState().project!.clips).toHaveLength(0);
    expect(useTimelineStore.getState().advanceFrame()).toBe(false);
  });

  it("再生中にシーク操作でフレームが変わる", () => {
    setupProjectWithParameter();

    const clipId = useClipStore.getState().createClip("テスト");
    useTimelineStore.getState().setActiveClip(clipId);
    useTimelineStore.getState().play();

    useTimelineStore.getState().seekTo(45);
    expect(useTimelineStore.getState().currentFrame).toBe(45);

    useTimelineStore.getState().seekTo(-10);
    expect(useTimelineStore.getState().currentFrame).toBe(0);

    useTimelineStore.getState().seekTo(9999);
    expect(useTimelineStore.getState().currentFrame).toBe(89);
  });

  it("stop で再生停止とフレームリセットが同時に行われる", () => {
    setupProjectWithParameter();

    const clipId = useClipStore.getState().createClip("テスト");
    useTimelineStore.getState().setActiveClip(clipId);
    useTimelineStore.setState({ isPlaying: true, currentFrame: 50 });

    useTimelineStore.getState().stop();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });
});


describe("物理演算 → パラメータ 統合", () => {
  beforeEach(resetAllStoresWithInactive);
  afterEach(resetAllStoresWithInactive);

  it("物理グループ初期化 → ランタイム状態生成", () => {
    setupProjectWithParameter();

    const physicsGroup = createPhysicsGroup({
      id: "phys-1",
      pendulums: [
        { length: 1, mass: 1, damping: 0.05 },
        { length: 0.8, mass: 0.5, damping: 0.1 },
      ],
    });

    usePhysicsStore.getState().initialize([physicsGroup]);

    const state = usePhysicsStore.getState();
    expect(state.runtimeStates["phys-1"]).toHaveLength(2);
    expect(state.runtimeStates["phys-1"]![0]).toEqual({
      angle: 0,
      angularVelocity: 0,
    });
  });

  it("物理リセットで全振り子状態がゼロになる", () => {
    setupProjectWithParameter();

    const physicsGroup = createPhysicsGroup({ id: "phys-1" });
    usePhysicsStore.getState().initialize([physicsGroup]);

    const state = usePhysicsStore.getState();
    if (state.runtimeStates["phys-1"]) {
      state.runtimeStates["phys-1"][0] = { angle: 1.5, angularVelocity: 3 };
    }

    usePhysicsStore.getState().reset();

    const resetState = usePhysicsStore.getState();
    expect(resetState.runtimeStates["phys-1"]?.[0]).toEqual({
      angle: 0,
      angularVelocity: 0,
    });
  });
});


describe("PSD 読み込み → エディタ 統合", () => {
  beforeEach(resetAllStoresWithInactive);
  afterEach(resetAllStoresWithInactive);

  it("PSD 読み込みでプロジェクト全体が初期化される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "character.psd");

    const state = useEditorStore.getState();
    expect(state.project).not.toBeNull();
    expect(state.project!.name).toBe("character");
    expect(state.project!.width).toBe(800);
    expect(state.project!.height).toBe(600);
    expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    expect(state.project!.clips).toEqual([]);
    expect(state.project!.physicsGroups).toEqual([]);
  });

  it("PSD 読み込み後にクリップ・パラメータを追加できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

    useParameterDefinitionStore.getState().addParameter("テスト", -10, 10, 0);
    expect(useEditorStore.getState().project!.parameters).toHaveLength(1);

    const clipId = useClipStore.getState().createClip("アニメ");
    expect(useEditorStore.getState().project!.clips).toHaveLength(1);

    useTimelineStore.getState().setActiveClip(clipId);
    useTimelineStore.getState().play();
    expect(useTimelineStore.getState().isPlaying).toBe(true);
  });
});


describe("ストア間状態整合性", () => {
  beforeEach(resetAllStoresWithInactive);
  afterEach(resetAllStoresWithInactive);

  it("プロジェクト閉じるとき関連ストアが一貫した状態になる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");

    const clipId = useClipStore.getState().createClip("テスト");
    useTimelineStore.getState().setActiveClip(clipId);
    useParameterStore.setState({ parameterValues: { p1: 5 } });

    closeProject();

    expect(useEditorStore.getState().project).toBeNull();
    expect(useSelectionStore.getState().selectedLayerId).toBeNull();
  });

  it("複数のクリップを切り替えてもフレーム位置がリセットされる", () => {
    setupProjectWithParameter();

    const clip1 = useClipStore.getState().createClip("クリップ1");
    const clip2 = useClipStore.getState().createClip("クリップ2");

    useTimelineStore.getState().setActiveClip(clip1);
    useTimelineStore.setState({ currentFrame: 50 });

    useTimelineStore.getState().setActiveClip(clip2);
    expect(useTimelineStore.getState().currentFrame).toBe(0);
    expect(useTimelineStore.getState().activeClipId).toBe(clip2);
  });
});
