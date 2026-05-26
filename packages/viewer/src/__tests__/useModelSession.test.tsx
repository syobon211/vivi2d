import { act, renderHook } from "@testing-library/react";
import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import type React from "react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_FORBIDDEN_FILE_URL } from "../../../../src/test/path-fixtures";
import { useModelSession } from "../hooks/useModelSession";
import type { UseViewerStateResult } from "../hooks/useViewerState";


const mockParseViviFile = vi.fn();
const mockExtractTextures = vi.fn();
const mockRendererCreate = vi.fn();
const mockSetModel = vi.fn();
const mockRender = vi.fn();
const mockRendererDestroy = vi.fn();
const mockParticlesDestroy = vi.fn();

vi.mock("@vivi2d/core/model", () => ({
  ViviModel: {
    fromFileData: vi.fn((data) => ({
      width: 100,
      height: 200,
      project: {
        name: data?.name ?? "TestModel",
        parameters: [{ id: "p1", name: "param1" }],
      },
      update: vi.fn(),
      setParameter: vi.fn(),
      setParameters: vi.fn(),
    })),
  },
}));

vi.mock("@vivi2d/core/project-parser", () => ({
  parseViviFile: (text: string) => mockParseViviFile(text),
}));

vi.mock("@vivi2d/renderer-pixi", () => ({
  extractTextures: (data: unknown) => mockExtractTextures(data),
  ViviPixiRenderer: {
    create: (canvas: HTMLCanvasElement, opts: unknown) =>
      mockRendererCreate(canvas, opts),
  },
  ParticleEffectRenderer: class {
    destroy = mockParticlesDestroy;
  },
}));

vi.mock("../tracking/auto-mapper", () => ({
  autoDetectMapping: vi.fn(() => ({ eyeOpenLeft: "p1" })),
  autoDetectHandMapping: vi.fn(() => ({ handLX: "p1" })),
  autoDetectPoseMapping: vi.fn(() => ({})),
}));

vi.mock("../tracking/platform-face-channels", () => ({
  autoDetectPlatformFaceMapping: vi.fn(() => ({ eyeBlinkLeft: "p1", eyeBlinkRight: "p1" })),
}));

function createMockState(): UseViewerStateResult {
  const noopFn = () => {};
  const ref = <T,>(value: T) => ({ current: value });
  return {
    setError: vi.fn(),
    setLoaded: vi.fn(),
    setModelName: vi.fn(),
    setDragging: vi.fn(),
    trackingMapRef: ref({}),
    platformFaceMapRef: ref({}),
    handTrackingMapRef: ref({}),
    poseTrackingMapRef: ref({}),
    setMappedCount: vi.fn(),
    setPlatformFaceMappedCount: vi.fn(),
    setHandMappedCount: vi.fn(),
    setPoseMappedCount: vi.fn(),
    loaded: false,
    error: null,
    modelName: "",
    dragging: false,
    tracking: false,
    setTracking: noopFn,
    handTracking: false,
    setHandTracking: noopFn,
    poseTracking: false,
    setPoseTracking: noopFn,
    lipSync: false,
    setLipSync: noopFn,
    bgMode: "transparent",
    setBgMode: noopFn,
    alwaysOnTop: false,
    setAlwaysOnTop: noopFn,
    smoothing: 0.6,
    setSmoothing: noopFn,
    selectedCamera: "",
    setSelectedCamera: noopFn,
    lipSyncMode: "rms",
    setLipSyncMode: noopFn,
    recordingFormat: "webm",
    setRecordingFormat: noopFn,
    colliderEffects: true,
    setColliderEffects: noopFn,
    mappedCount: 0,
    platformFaceMappedCount: 0,
    handMappedCount: 0,
    poseMappedCount: 0,
    showHud: false,
    setShowHud: noopFn,
    hudStats: { fps: 0, meshes: 0, vertices: 0 },
    setHudStats: noopFn,
    panelOpen: false,
    setPanelOpen: noopFn,
    currentVowel: "silent",
    setCurrentVowel: noopFn,
    recordingState: "idle",
    setRecordingState: noopFn,
    recordingElapsed: 0,
    setRecordingElapsed: noopFn,
    gamepadActive: false,
    setGamepadActive: noopFn,
    midiActive: false,
    setMidiActive: noopFn,
    smoothingRef: ref(0.6),
    showHudRef: ref(false),
    initialSettings: {
      bgMode: "transparent",
      smoothing: 0.6,
      cameraDeviceId: "",
      alwaysOnTop: false,
      lipSyncMode: "rms",
      recordingFormat: "webm",
      colliderEffects: true,
    },
  } as unknown as UseViewerStateResult;
}

function renderUseModelSession(opts?: {
  withCanvas?: boolean;
  state?: UseViewerStateResult;
}) {
  const state = opts?.state ?? createMockState();
  const recorderFactory = vi.fn(
    () =>
      ({
        /* mock recorder */
      }) as never,
  );
  return renderHook(() => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    if (opts?.withCanvas !== false && !canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    const recorderRef = useRef(null);
    const t = (k: string) => `t:${k}`;
    return {
      ...useModelSession({ canvasRef, recorderRef, recorderFactory, state, t }),
      canvasRef,
      state,
      recorderFactory,
    };
  });
}

describe("useModelSession", () => {
  beforeEach(() => {
    mockParseViviFile.mockReset().mockReturnValue({ name: "Parsed" });
    mockExtractTextures.mockReset().mockResolvedValue({});
    mockSetModel.mockReset();
    mockRender.mockReset();
    mockRendererDestroy.mockReset();
    mockParticlesDestroy.mockReset();
    mockRendererCreate.mockReset().mockResolvedValue({
      setModel: mockSetModel,
      render: mockRender,
      destroy: mockRendererDestroy,
      pixiApp: { stage: {} },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadModel: File 入力", () => {
    it("File を text() でパース → モデル+renderer 生成", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "Hero.vivi", { type: "application/json" });
      await act(async () => {
        await result.current.loadModel(file);
      });
      expect(mockParseViviFile).toHaveBeenCalled();
      expect(mockRendererCreate).toHaveBeenCalled();
      expect(mockSetModel).toHaveBeenCalled();
      expect(mockRender).toHaveBeenCalled();
      expect(result.current.state.setLoaded).toHaveBeenCalledWith(true);
    });

    it("modelName は project.name 優先、なければ ファイル名 から .vivi を除く", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "Hero.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      expect(result.current.state.setModelName).toHaveBeenCalledWith("Parsed");
    });

    it("自動マッピングが ref に書き込まれ count も同期", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "Hero.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      expect(result.current.state.trackingMapRef.current).toEqual({
        eyeOpenLeft: "p1",
      });
      expect(result.current.state.platformFaceMapRef.current).toEqual({
        eyeBlinkLeft: "p1",
        eyeBlinkRight: "p1",
      });
      expect(result.current.state.setMappedCount).toHaveBeenCalledWith(1);
      expect(result.current.state.setPlatformFaceMappedCount).toHaveBeenCalledWith(2);
    });

    it("recorderFactory が canvas で呼ばれ recorderRef に格納", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "Hero.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      expect(result.current.recorderFactory).toHaveBeenCalledWith(
        result.current.canvasRef.current,
      );
    });

    it("再ロード時は前回 renderer を destroy してから生成", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "A.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "B.vivi"));
      });
      expect(mockRendererDestroy).toHaveBeenCalled();
    });

    it("canvas 未マウント時は早期リターン (setLoaded されない)", async () => {
      const { result } = renderUseModelSession({ withCanvas: false });
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "X.vivi"));
      });
      expect(result.current.state.setLoaded).not.toHaveBeenCalled();
    });

    it("rejects oversized local files before reading them", async () => {
      const { result } = renderUseModelSession();
      const text = vi.fn();
      const file = {
        name: "Huge.vivi",
        size: MAX_VIVI_TEXT_FILE_BYTES + 1,
        text,
      } as unknown as File;

      await act(async () => {
        await result.current.loadModel(file);
      });

      expect(text).not.toHaveBeenCalled();
      expect(result.current.state.setError).toHaveBeenCalledWith(
        expect.stringContaining(".vivi file is too large"),
      );
    });
  });

  describe("loadModel: URL 入力", () => {
    it("fetch 成功で text を渡してロード", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: null,
        text: async () => "{}",
      } as unknown as Response);
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel("https://example.com/model.vivi");
      });
      expect(fetchSpy).toHaveBeenCalledWith("https://example.com/model.vivi");
      expect(result.current.state.setModelName).toHaveBeenCalledWith("model");
    });

    it("fetch !ok で error が設定される", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel("https://example.com/model.vivi");
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("HTTP 404");
    });

    it("rejects oversized remote models from content-length", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-length": String(MAX_VIVI_TEXT_FILE_BYTES + 1),
        }),
        body: null,
        text: vi.fn(),
      } as unknown as Response);

      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel("https://example.com/model.vivi");
      });

      expect(fetchSpy).toHaveBeenCalled();
      expect(result.current.state.setError).toHaveBeenCalledWith(
        expect.stringContaining("Remote .vivi model is too large"),
      );
    });
  });

  describe("loadModel: エラーハンドリング", () => {
    it("parseViviFile が throw すると setError(message)", async () => {
      mockParseViviFile.mockImplementation(() => {
        throw new Error("invalid json");
      });
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["x"], "bad.vivi"));
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("invalid json");
    });

    it("非 Error 例外は t('errFileLoad') にフォールバック", async () => {
      mockParseViviFile.mockImplementation(() => {
        throw "string-error" as never;
      });
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["x"], "bad.vivi"));
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
    });
  });

  describe("handleFileLoad / handleUrlLoad", () => {
    it("handleFileLoad は loadModel を呼ぶ", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "X.vivi");
      await act(async () => {
        await result.current.handleFileLoad(file);
      });
      expect(mockParseViviFile).toHaveBeenCalled();
    });

    it("handleUrlLoad: prompt キャンセルなら no-op", async () => {
      vi.stubGlobal(
        "prompt",
        vi.fn(() => null),
      );
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.handleUrlLoad();
      });
      expect(mockParseViviFile).not.toHaveBeenCalled();
    });

    it("handleUrlLoad: 不正な URL で setError", async () => {
      vi.stubGlobal(
        "prompt",
        vi.fn(() => "not a url"),
      );
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.handleUrlLoad();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errInvalidUrl");
    });

    it("handleUrlLoad: file:// プロトコルは拒否", async () => {
      vi.stubGlobal(
        "prompt",
        vi.fn(() => TEST_FORBIDDEN_FILE_URL),
      );
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.handleUrlLoad();
      });
      expect(result.current.state.setError).toHaveBeenCalledWith(
        "t:errUrlProtocol",
      );
    });

    it("handleUrlLoad: https URL なら fetch が走る", async () => {
      vi.stubGlobal(
        "prompt",
        vi.fn(() => "https://example.com/x.vivi"),
      );
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: async () => "{}",
      } as Response);
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.handleUrlLoad();
      });
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe("ドラッグ&ドロップ", () => {
    function makeDragEvent(files: File[] = []): React.DragEvent {
      return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files } as unknown as DataTransfer,
      } as unknown as React.DragEvent;
    }

    it("dragOver で setDragging(true) + preventDefault", () => {
      const { result } = renderUseModelSession();
      const e = makeDragEvent();
      act(() => result.current.handleDragOver(e));
      expect(e.preventDefault).toHaveBeenCalled();
      expect(result.current.state.setDragging).toHaveBeenCalledWith(true);
    });

    it("dragLeave で setDragging(false)", () => {
      const { result } = renderUseModelSession();
      act(() => result.current.handleDragLeave());
      expect(result.current.state.setDragging).toHaveBeenCalledWith(false);
    });

    it("drop: .vivi ファイルなら handleFileLoad を呼ぶ", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "X.vivi");
      const e = makeDragEvent([file]);
      await act(async () => {
        result.current.handleDrop(e);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.state.setDragging).toHaveBeenCalledWith(false);
      expect(mockParseViviFile).toHaveBeenCalled();
    });

    it("drop: .vivi でないファイルなら setError(errDropVivi)", () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "X.psd");
      const e = makeDragEvent([file]);
      act(() => result.current.handleDrop(e));
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errDropVivi");
      expect(mockParseViviFile).not.toHaveBeenCalled();
    });

    it("drop: ファイル無しなら setError", () => {
      const { result } = renderUseModelSession();
      const e = makeDragEvent([]);
      act(() => result.current.handleDrop(e));
      expect(result.current.state.setError).toHaveBeenCalled();
    });
  });

  describe("unmount cleanup", () => {
    it("unmount 時に renderer/particles を destroy", async () => {
      const { result, unmount } = renderUseModelSession();
      const file = new File(["{}"], "X.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      mockRendererDestroy.mockClear();
      mockParticlesDestroy.mockClear();
      unmount();
      expect(mockRendererDestroy).toHaveBeenCalled();
      expect(mockParticlesDestroy).toHaveBeenCalled();
    });
  });
});
