import type { IKSolution } from "@vivi2d/core/ik-solver";
import { mapIKToParameters } from "@vivi2d/core/ik-solver";
import { evaluateImageSequenceTracksAtFrame } from "@vivi2d/core/image-sequence-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { previewAutoSetup } from "@/lib/auto-setup";
import { useArtPathStore } from "@/stores/artPathStore";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { createAnimationClip, createBoneNode, createViviMesh } from "@/test/fixtures";
import { setupProjectWithParameters, setupTestProject } from "@/test/helpers";

describe("画像シーケンス + クリップ統合", () => {
  beforeEach(() => {
    setupProjectWithParameters([
      { id: "p1", name: "パラメータ1", min: 0, max: 1, defaultValue: 0 },
    ]);
  });

  it("クリップに画像シーケンストラック追加→エントリ追加→フレーム評価の全フロー", () => {
    const project = useEditorStore.getState().project!;
    const meshId = project.layers[0]!.id;

    const clip = createAnimationClip({ duration: 60, fps: 30, tracks: [] });
    useEditorStore.setState({
      project: {
        ...project,
        scenes: [{ id: "scene-1", name: "デフォルト", clips: [clip] }],
      },
    });

    useClipStore.getState().addImageSequenceTrack(clip.id, meshId);

    useClipStore.getState().addImageSequenceEntry(clip.id, meshId, 0, "img-a");
    useClipStore.getState().addImageSequenceEntry(clip.id, meshId, 15, "img-b");
    useClipStore.getState().addImageSequenceEntry(clip.id, meshId, 30, "img-c");

    const updated = useEditorStore.getState().project!;
    const updatedClip = updated.scenes[0]!.clips[0]!;
    expect(updatedClip.imageSequenceTracks).toHaveLength(1);
    expect(updatedClip.imageSequenceTracks![0]!.entries).toHaveLength(3);

    const tracks = updatedClip.imageSequenceTracks!;
    const result0 = evaluateImageSequenceTracksAtFrame(tracks, 0);
    const result10 = evaluateImageSequenceTracksAtFrame(tracks, 10);
    const result20 = evaluateImageSequenceTracksAtFrame(tracks, 20);
    const result40 = evaluateImageSequenceTracksAtFrame(tracks, 40);

    expect(result0[meshId]).toBe("img-a");
    expect(result10[meshId]).toBe("img-a");
    expect(result20[meshId]).toBe("img-b");
    expect(result40[meshId]).toBe("img-c");
  });

  it("トラック削除で画像シーケンスが消える", () => {
    const project = useEditorStore.getState().project!;
    const meshId = project.layers[0]!.id;
    const clip = createAnimationClip({ duration: 30, fps: 30, tracks: [] });
    useEditorStore.setState({
      project: {
        ...project,
        scenes: [{ id: "s1", name: "s", clips: [clip] }],
      },
    });

    useClipStore.getState().addImageSequenceTrack(clip.id, meshId);
    useClipStore.getState().addImageSequenceEntry(clip.id, meshId, 0, "img");
    useClipStore.getState().removeImageSequenceTrack(clip.id, meshId);

    const updated = useEditorStore.getState().project!;
    expect(updated.scenes[0]!.clips[0]!.imageSequenceTracks).toHaveLength(0);
  });
});

describe("IKコントローラ + パラメータ統合", () => {
  beforeEach(() => {
    setupProjectWithParameters(
      [{ id: "p-angle", name: "角度", min: -180, max: 180, defaultValue: 0 }],
      [
        createBoneNode({ id: "bone-upper", name: "上腕" }),
        createBoneNode({ id: "bone-lower", name: "前腕" }),
      ],
    );
  });

  it("IK追加→ターゲット設定→ランタイムターゲット→永続化の全フロー", () => {
    const ikStore = useIKControllerStore.getState();
    const id = ikStore.addIKController("腕IK", "twoBone", [
      { boneId: "bone-upper", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "bone-lower", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);

    const project1 = useEditorStore.getState().project!;
    const ctrl1 = project1.ikControllers!.find((c) => c.id === id)!;
    expect(ctrl1.targetX).toBe(0);
    expect(ctrl1.targetY).toBe(0);

    ikStore.setTarget(id, 150, 200);
    const project2 = useEditorStore.getState().project!;
    const ctrl2 = project2.ikControllers!.find((c) => c.id === id)!;
    expect(ctrl2.targetX).toBe(150);
    expect(ctrl2.targetY).toBe(200);

    useIKRuntimeStore.getState().setRuntimeTarget(id, 300, 400);
    const rt = useIKRuntimeStore.getState().runtimeTargets.get(id);
    expect(rt).toEqual({ x: 300, y: 400 });

    useIKRuntimeStore.getState().clearRuntimeTarget(id);
    expect(useIKRuntimeStore.getState().runtimeTargets.get(id)).toBeUndefined();
  });

  it("パラメータマッピング追加→IK解からパラメータ値が算出される", () => {
    const ikStore = useIKControllerStore.getState();
    const id = ikStore.addIKController("マッピングIK", "twoBone", [
      { boneId: "bone-upper", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);

    ikStore.addParameterMapping(id, {
      boneId: "bone-upper",
      parameterId: "p-angle",
      angleMin: -Math.PI,
      angleMax: Math.PI,
      paramMin: -180,
      paramMax: 180,
    });

    const project = useEditorStore.getState().project!;
    const ctrl = project.ikControllers!.find((c) => c.id === id)!;
    expect(ctrl.parameterMappings).toHaveLength(1);

    const mockSolution: IKSolution = {
      solvedAngles: new Map([["bone-upper", Math.PI / 4]]),
      reached: true,
    };

    const params = mapIKToParameters(ctrl, mockSolution);
    expect(params).toEqual({ "p-angle": 45 });
  });
});

describe("ArtPath + プロジェクト統合", () => {
  beforeEach(() => {
    setupTestProject();
  });

  it("ArtPathノード追加→制御点追加→スタイル変更→プロジェクト反映の全フロー", () => {
    const apStore = useArtPathStore.getState();

    const id = apStore.addArtPath("テストパス", 100, 200);
    let project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node).toBeDefined();
    expect(node!.kind).toBe("artPath");

    apStore.addControlPoint(id, {
      x: 0,
      y: 0,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 30,
      handleOutY: 0,
      width: 3,
      opacity: 1,
    });
    apStore.addControlPoint(id, {
      x: 100,
      y: 0,
      handleInX: -30,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 3,
      opacity: 1,
    });

    project = useEditorStore.getState().project!;
    const apNode = project.layers.find((l) => l.id === id);
    expect(apNode!.kind === "artPath" && apNode!.controlPoints.length).toBe(2);

    apStore.setStyle(id, { color: 0xff0000, baseWidth: 5 });
    project = useEditorStore.getState().project!;
    const styled = project.layers.find((l) => l.id === id);
    expect(styled!.kind === "artPath" && styled!.style.color).toBe(0xff0000);
    expect(styled!.kind === "artPath" && styled!.style.baseWidth).toBe(5);

    apStore.setClosed(id, true);
    project = useEditorStore.getState().project!;
    const closed = project.layers.find((l) => l.id === id);
    expect(closed!.kind === "artPath" && closed!.closed).toBe(true);
  });

  it("制御点の更新が正しく反映される", () => {
    const apStore = useArtPathStore.getState();
    const id = apStore.addArtPath("更新テスト", 0, 0);

    apStore.addControlPoint(id, {
      x: 0,
      y: 0,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });

    apStore.updateControlPoint(id, 0, { x: 50, y: 75, width: 5 });

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    if (node!.kind === "artPath") {
      expect(node!.controlPoints[0]!.x).toBe(50);
      expect(node!.controlPoints[0]!.y).toBe(75);
      expect(node!.controlPoints[0]!.width).toBe(5);
    }
  });
});

describe("自動セットアップ統合", () => {
  it("PSD風レイヤーからパーツ検出→ボーン/物理プレビューの全フロー", () => {
    const project = setupTestProject({
      layers: [
        createViviMesh({ id: "m1", name: "左目", x: 350, y: 200, width: 50, height: 30 }),
        createViviMesh({ id: "m2", name: "右目", x: 450, y: 200, width: 50, height: 30 }),
        createViviMesh({ id: "m3", name: "口", x: 400, y: 350, width: 60, height: 25 }),
        createViviMesh({
          id: "m4",
          name: "前髪",
          x: 300,
          y: 50,
          width: 200,
          height: 120,
        }),
        createViviMesh({ id: "m5", name: "体", x: 300, y: 300, width: 200, height: 400 }),
      ],
    });

    const result = previewAutoSetup(project, {
      generateBones: true,
      generatePhysics: true,
      minConfidence: 0.3,
    });

    expect(result.detectedParts.length).toBeGreaterThan(0);

    const categories = result.detectedParts.map((p) => p.category);
    expect(categories).toEqual(expect.arrayContaining(["eyeLeft"]));
    expect(categories).toEqual(expect.arrayContaining(["mouth"]));

    expect(result.boneResult).not.toBeNull();
    expect(result.boneResult!.bones.length).toBeGreaterThan(0);
    expect(result.boneResult!.parameters.length).toBeGreaterThan(0);

    expect(result.physicsGroups.length).toBeGreaterThan(0);
  });

  it("generateBones=false の場合ボーンが生成されない", () => {
    const project = setupTestProject({
      layers: [createViviMesh({ name: "左目" })],
    });

    const result = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0.3,
    });

    expect(result.boneResult).toBeNull();
    expect(result.physicsGroups).toHaveLength(0);
  });
});
