import { act, renderHook } from "@testing-library/react";
import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/core/load-limits";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelSession } from "../hooks/useModelSession";

const mockParseViviFile = vi.fn();
const mockExtractTextures = vi.fn();
const mockRendererCreate = vi.fn();

vi.mock("@vivi2d/core/model", () => ({
  ViviModel: {
    fromFileData: vi.fn(() => ({
      width: 100,
      height: 200,
      project: {
        name: "TestModel",
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
  ParticleEffectRenderer: class {},
}));

vi.mock("../tracking/auto-mapper", () => ({
  autoDetectMapping: vi.fn(() => ({})),
  autoDetectHandMapping: vi.fn(() => ({})),
  autoDetectPoseMapping: vi.fn(() => ({})),
}));

vi.mock("../tracking/platform-face-channels", () => ({
  autoDetectPlatformFaceMapping: vi.fn(() => ({})),
}));

function createMockState() {
  return {
    setError: vi.fn(),
    setLoaded: vi.fn(),
    setModelName: vi.fn(),
    setDragging: vi.fn(),
    trackingMapRef: { current: {} },
    platformFaceMapRef: { current: {} },
    handTrackingMapRef: { current: {} },
    poseTrackingMapRef: { current: {} },
    setMappedCount: vi.fn(),
    setPlatformFaceMappedCount: vi.fn(),
    setHandMappedCount: vi.fn(),
    setPoseMappedCount: vi.fn(),
  };
}

function renderUseModelSession() {
  const state = createMockState();
  const recorderFactory = vi.fn(() => ({}) as never);
  return renderHook(() => {
    const canvasRef = useRef<HTMLCanvasElement | null>(document.createElement("canvas"));
    const recorderRef = useRef(null);
    const t = (key: string) => `t:${key}`;
    return {
      ...useModelSession({ canvasRef, recorderRef, recorderFactory, state, t }),
      state,
    };
  });
}

describe("useModelSession security guards", () => {
  beforeEach(() => {
    mockParseViviFile.mockReset().mockReturnValue({ name: "Parsed" });
    mockExtractTextures.mockReset().mockResolvedValue({});
    mockRendererCreate.mockReset().mockResolvedValue({
      setModel: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      pixiApp: { stage: {} },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("cancels and releases an oversized streaming response", async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({
        done: false,
        value: { byteLength: MAX_VIVI_TEXT_FILE_BYTES + 1 },
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response);
    const { result } = renderUseModelSession();
    await act(async () => {
      await result.current.loadModel("https://example.com/oversized.vivi");
    });
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(mockParseViviFile).not.toHaveBeenCalled();
  });

  it("cancels a non-OK fetched response owned by the Viewer", async () => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 503 }),
    );
    const { result } = renderUseModelSession();
    await act(async () => {
      await result.current.loadModel("https://example.invalid/model.vivi");
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(mockParseViviFile).not.toHaveBeenCalled();
  });

  it.each([
    "fetch",
    "parse",
  ])("does not display raw %s failure details", async (stage) => {
    const failure = new TypeError("synthetic-password in rejected source");
    const { result } = renderUseModelSession();
    if (stage === "fetch") vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    else
      mockParseViviFile.mockImplementationOnce(() => {
        throw failure;
      });
    await act(async () => {
      await result.current.loadModel(
        stage === "fetch"
          ? "https://example.invalid/model.vivi"
          : ({ size: 2, name: "model.vivi", text: async () => "{}" } as File),
      );
    });
    expect(result.current.state.setError).toHaveBeenLastCalledWith("t:errFileLoad");
  });
});
