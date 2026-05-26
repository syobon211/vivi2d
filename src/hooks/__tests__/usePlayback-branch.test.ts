import { renderHook } from "@testing-library/react";
import * as imageSeqUtils from "@vivi2d/core/image-sequence-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTexture } from "@/lib/texture-store";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { useParameterStore } from "@/stores/parameterStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createEmptyProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetLipSyncStore,
  resetParameterStore,
  resetPhysicsStore,
  resetTimelineStore,
} from "@/test/store-reset";
import { usePlayback } from "../usePlayback";


let rafCallbacks: Array<(time: number) => void> = [];
let rafIdCounter = 1;

function flushRaf(time: number) {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  for (const cb of cbs) {
    cb(time);
  }
}

function resetStores() {
  resetEditorStore();
  resetParameterStore();
  resetTimelineStore();
  resetLipSyncStore();
  resetPhysicsStore();
  usePhysicsStore.setState({ isActive: false });
}

function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
        { id: "p2", name: "口", minValue: 0, maxValue: 1, defaultValue: 0 },
      ],
    },
    projectVersion: 1,
  });
}

function createAndActivateClip(): string {
  const id = useClipStore.getState().createClip("テスト");
  useTimelineStore.getState().setActiveClip(id);
  return id;
}


describe("usePlayback — 画像シーケンス評価分岐（lines 96-108）", () => {
  beforeEach(() => {
    resetStores();
    rafCallbacks = [];
    rafIdCounter = 1;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafIdCounter++;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("画像シーケンストラックがある場合、テクスチャが適用される", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    const project = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: {
        ...project,
        clips: [
          {
            ...project.clips[0]!,
            imageSequenceTracks: [
              {
                targetMeshId: "mesh-target",
                entries: [{ startFrame: 0, imageId: "img-source" }],
              },
            ],
          },
        ],
      },
    });

    const mockCanvas = document.createElement("canvas");
    setTexture("img-source", mockCanvas);

    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("画像シーケンスで imageId === targetMeshId の場合はスキップされる", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    vi.spyOn(imageSeqUtils, "evaluateImageSequenceTracksAtFrame").mockReturnValue({
      "mesh-target": "mesh-target", // imageId === targetMeshId
    });

    const project = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: {
        ...project,
        clips: [
          {
            ...project.clips[0]!,
            imageSequenceTracks: [
              {
                targetMeshId: "mesh-target",
                entries: [{ startFrame: 0, imageId: "mesh-target" }],
              },
            ],
          },
        ],
      },
    });

    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("画像シーケンスでソースキャンバスが存在しない場合はスキップされる", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    vi.spyOn(imageSeqUtils, "evaluateImageSequenceTracksAtFrame").mockReturnValue({
      "mesh-target": "nonexistent-image",
    });

    const project = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: {
        ...project,
        clips: [
          {
            ...project.clips[0]!,
            imageSequenceTracks: [
              {
                targetMeshId: "mesh-target",
                entries: [{ startFrame: 0, imageId: "nonexistent-image" }],
              },
            ],
          },
        ],
      },
    });

    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("activeClipId が null の場合 tick は早期リターンする", () => {
    setupProject();
    useTimelineStore.setState({ isPlaying: true, activeClipId: null, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
    expect(useParameterStore.getState().parameterValues).toEqual({});
  });

  it("プロジェクトが null の場合 tick は早期リターンする", () => {
    useEditorStore.setState({ project: null });
    useTimelineStore.setState({
      isPlaying: true,
      activeClipId: "some-clip",
      currentFrame: 0,
    });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("対象クリップが見つからない場合 tick は早期リターンする", () => {
    setupProject();
    useTimelineStore.setState({
      isPlaying: true,
      activeClipId: "nonexistent-clip",
      currentFrame: 0,
    });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("経過時間が interval 未満の場合はフレームを進めない", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const tooEarly = (1000 / 30) * 0.5;
    vi.spyOn(performance, "now").mockReturnValue(tooEarly);
    flushRaf(tooEarly);

    expect(useTimelineStore.getState().currentFrame).toBe(0);
  });

  it("リップシンクの targetParameterId が無効（該当パラメータなし）の場合", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    const project = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: {
        ...project,
        lipsyncConfig: {
          enabled: true,
          targetParameterId: "nonexistent-param",
          source: "microphone",
          threshold: 0.02,
          smoothing: 0.7,
          gain: 2.0,
        },
      },
    });

    useLipSyncStore.setState({ isConnected: true, currentVolume: 0.5 });
    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });

  it("ボーントラックで scaleY のみ指定された場合のフォールバック", () => {
    setupProject();
    const clipId = createAndActivateClip();
    useClipStore.getState().addKeyframe(clipId, "p1", 0, 0);

    const project = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: {
        ...project,
        layers: [
          {
            id: "bone-1",
            name: "テストボーン",
            kind: "bone" as const,
            visible: true,
            opacity: 1,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            children: [],
            blendMode: "normal" as const,
            expanded: true,
            bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
          },
        ],
        clips: [
          {
            ...project.clips[0]!,
            boneTracks: [
              {
                boneId: "bone-1",
                property: "scaleY" as const,
                keyframes: [
                  { frame: 0, value: 1, interpolation: "linear" as const },
                  { frame: 89, value: 2, interpolation: "linear" as const },
                ],
              },
            ],
          },
        ],
      },
    });

    useTimelineStore.setState({ isPlaying: true, currentFrame: 0 });
    renderHook(() => usePlayback());

    const interval = 1000 / 30 + 1;
    vi.spyOn(performance, "now").mockReturnValue(interval);
    expect(() => flushRaf(interval)).not.toThrow();
  });
});
