import { act, renderHook } from "@testing-library/react";
import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import type React from "react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_FORBIDDEN_FILE_URL } from "../../../../src/test/path-fixtures";
import { useModelSession } from "../hooks/useModelSession";
import type { UseViewerStateResult } from "../hooks/useViewerState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

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
  autoDetectPlatformFaceMapping: vi.fn(() => ({
    eyeBlinkLeft: "p1",
    eyeBlinkRight: "p1",
  })),
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
    (_canvas: HTMLCanvasElement, _beforeCapture: () => void) =>
      ({
        cancel: vi.fn(),
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
      resize: vi.fn(),
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
        expect.any(Function),
      );
    });

    it("fresh recording capture uses the current renderer and rejects its absence", async () => {
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "Hero.vivi"));
      });
      const beforeCapture = result.current.recorderFactory.mock.calls[0]![1];
      mockRender.mockClear();
      beforeCapture();
      expect(mockRender).toHaveBeenCalledOnce();
      const replacementRender = vi.fn();
      result.current.rendererRef.current = { render: replacementRender } as never;
      beforeCapture();
      expect(replacementRender).toHaveBeenCalledOnce();
      result.current.rendererRef.current = null;
      expect(beforeCapture).toThrow("Recording failed.");
    });

    it("reuses the renderer and recorder owned by the mounted canvas on reload", async () => {
      const { result } = renderUseModelSession();
      const file = new File(["{}"], "A.vivi");
      await act(async () => {
        await result.current.loadModel(file);
      });
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "B.vivi"));
      });
      expect(mockRendererDestroy).not.toHaveBeenCalled();
      expect(mockRendererCreate).toHaveBeenCalledOnce();
      expect(result.current.recorderFactory).toHaveBeenCalledOnce();
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
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
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
      expect(fetchSpy).toHaveBeenCalledWith("https://example.com/model.vivi", {
        signal: expect.any(AbortSignal),
        credentials: "omit",
      });
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
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
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
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
    });
  });

  describe("loadModel: エラーハンドリング", () => {
    it("does not publish a model whose first render fails and permits retry", async () => {
      mockRender.mockImplementationOnce(() => {
        throw new Error("render failed");
      });
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "bad.vivi"));
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
      expect(result.current.modelRef.current).toBeNull();
      expect(result.current.rendererRef.current).toBeNull();
      expect(result.current.particlesRef.current).toBeNull();
      expect(result.current.state.setLoaded).not.toHaveBeenCalledWith(true);
      expect(mockRendererDestroy).toHaveBeenCalledOnce();
      expect(mockParticlesDestroy).toHaveBeenCalledOnce();
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "retry.vivi"));
      });
      expect(mockRendererCreate).toHaveBeenCalledTimes(2);
      expect(result.current.state.setLoaded).toHaveBeenLastCalledWith(true);
    });

    it("clears the old host model if renderer replacement throws", async () => {
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "old.vivi"));
      });
      mockSetModel.mockImplementationOnce(() => {
        throw new Error("setModel failed after replacement");
      });
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "bad.vivi"));
      });
      expect(result.current.modelRef.current).toBeNull();
      expect(result.current.rendererRef.current).toBeNull();
      expect(result.current.particlesRef.current).toBeNull();
      expect(result.current.state.setLoaded).toHaveBeenLastCalledWith(false);
      expect(mockRendererDestroy).toHaveBeenCalledOnce();
      expect(mockParticlesDestroy).toHaveBeenCalledOnce();
    });

    it("preserves the loaded model when parsing fails before renderer replacement", async () => {
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["{}"], "old.vivi"));
      });
      const previousModel = result.current.modelRef.current;
      const previousRenderer = result.current.rendererRef.current;
      mockParseViviFile.mockImplementationOnce(() => {
        throw new Error("invalid json");
      });
      await act(async () => {
        await result.current.loadModel(new File(["x"], "bad.vivi"));
      });
      expect(result.current.modelRef.current).toBe(previousModel);
      expect(result.current.rendererRef.current).toBe(previousRenderer);
      expect(result.current.state.setLoaded).toHaveBeenLastCalledWith(true);
      expect(mockRendererDestroy).not.toHaveBeenCalled();
      expect(mockParticlesDestroy).not.toHaveBeenCalled();
    });

    it("parseViviFile が throw すると秘匿化したエラーを設定する", async () => {
      mockParseViviFile.mockImplementation(() => {
        throw new Error("invalid json");
      });
      const { result } = renderUseModelSession();
      await act(async () => {
        await result.current.loadModel(new File(["x"], "bad.vivi"));
      });
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errFileLoad");
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
      expect(result.current.state.setError).toHaveBeenCalledWith("t:errUrlProtocol");
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

  describe("overlapping model loads", () => {
    it("keeps the newer model when an older texture decode finishes last", async () => {
      const textures = deferred<Map<string, HTMLCanvasElement>>();
      mockExtractTextures.mockReturnValueOnce(textures.promise);
      mockParseViviFile.mockImplementation(JSON.parse);
      const { result } = renderUseModelSession();
      await act(async () => {
        const older = result.current.loadModel(new File(['{"name":"old"}'], "old.vivi"));
        await vi.waitFor(() => expect(mockExtractTextures).toHaveBeenCalledOnce());
        await result.current.loadModel(new File(['{"name":"new"}'], "new.vivi"));
        textures.resolve(new Map());
        await older;
      });
      expect(result.current.modelRef.current?.project.name).toBe("new");
      expect(mockSetModel).toHaveBeenCalledOnce();
    });

    it("initializes the shared canvas once when loads overlap during renderer creation", async () => {
      const initialization = deferred<Awaited<ReturnType<typeof mockRendererCreate>>>();
      const renderer = {
        setModel: mockSetModel,
        render: mockRender,
        resize: vi.fn(),
        destroy: mockRendererDestroy,
        pixiApp: { stage: {} },
      };
      mockRendererCreate.mockReturnValueOnce(initialization.promise);
      mockParseViviFile.mockImplementation(JSON.parse);
      const { result } = renderUseModelSession();
      await act(async () => {
        const older = result.current.loadModel(new File(['{"name":"old"}'], "old.vivi"));
        await vi.waitFor(() => expect(mockRendererCreate).toHaveBeenCalledOnce());
        const newer = result.current.loadModel(new File(['{"name":"new"}'], "new.vivi"));
        await vi.waitFor(() => expect(mockExtractTextures).toHaveBeenCalledTimes(2));
        initialization.resolve(renderer);
        await Promise.all([older, newer]);
      });
      expect(mockRendererCreate).toHaveBeenCalledOnce();
      expect(mockSetModel).toHaveBeenCalledOnce();
      expect(result.current.modelRef.current?.project.name).toBe("new");
    });

    it("destroys a late renderer without publishing state after unmount", async () => {
      const initialization = deferred<Awaited<ReturnType<typeof mockRendererCreate>>>();
      const renderer = {
        setModel: mockSetModel,
        render: mockRender,
        resize: vi.fn(),
        destroy: mockRendererDestroy,
        pixiApp: { stage: {} },
      };
      mockRendererCreate.mockReturnValueOnce(initialization.promise);
      const { result, unmount } = renderUseModelSession();
      const session = result.current;
      let pending!: Promise<void>;
      await act(async () => {
        pending = session.loadModel(new File(["{}"], "late.vivi"));
        await vi.waitFor(() => expect(mockRendererCreate).toHaveBeenCalledOnce());
      });
      unmount();
      initialization.resolve(renderer);
      await pending;
      expect(mockRendererDestroy).toHaveBeenCalledOnce();
      expect(mockSetModel).not.toHaveBeenCalled();
      expect(session.state.setLoaded).not.toHaveBeenCalled();
      expect(session.modelRef.current).toBeNull();
    });

    it("does not let a stale fetch error clear the current loading state", async () => {
      const olderFetch = deferred<Response>();
      const newerFetch = deferred<Response>();
      vi.spyOn(globalThis, "fetch")
        .mockReturnValueOnce(olderFetch.promise)
        .mockReturnValueOnce(newerFetch.promise);
      const { result } = renderUseModelSession();
      let newer!: Promise<void>;
      await act(async () => {
        const older = result.current.loadModel("https://example.com/old.vivi");
        newer = result.current.loadModel("https://example.com/new.vivi");
        olderFetch.reject(new Error("old aborted"));
        await older;
      });
      expect(result.current.loading).toBe(true);
      expect(
        vi
          .mocked(result.current.state.setError)
          .mock.calls.filter(([message]) => message !== null),
      ).toHaveLength(0);
      await act(async () => {
        newerFetch.resolve(new Response("{}"));
        await newer;
      });
      expect(result.current.loading).toBe(false);
    });
  });
});
