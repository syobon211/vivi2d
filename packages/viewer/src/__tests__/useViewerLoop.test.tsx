import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewerLoop } from "../hooks/useViewerLoop";
import type { TrackingParameterMap } from "../tracking/face-mapper";

describe("useViewerLoop", () => {
  let scheduled = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  let requestAnimationFrameMock: ReturnType<typeof vi.fn>;
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scheduled = new Map<number, FrameRequestCallback>();
    nextFrameId = 1;
    requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      scheduled.set(id, callback);
      return id;
    });
    cancelAnimationFrameMock = vi.fn((id: number) => {
      scheduled.delete(id);
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushFrame(time: number) {
    const next = scheduled.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!next) throw new Error("No animation frame scheduled");
    scheduled.delete(next[0]);
    act(() => {
      next[1](time);
    });
  }

  function buildArgs(overrides: Partial<Parameters<typeof useViewerLoop>[0]> = {}) {
    const setCurrentVowel = vi.fn();
    const setHudStats = vi.fn();
    const model = {
      setParameter: vi.fn(),
      update: vi.fn(),
      getAllMeshStates: vi.fn(
        () =>
          new Map([
            [
              "visible",
              {
                visible: true,
                culled: false,
                vertices: new Float32Array([0, 0, 1, 1, 2, 2]),
              },
            ],
            [
              "hidden",
              {
                visible: false,
                culled: false,
                vertices: new Float32Array([0, 0]),
              },
            ],
            [
              "culled",
              {
                visible: true,
                culled: true,
                vertices: new Float32Array([0, 0]),
              },
            ],
          ]),
      ),
    };
    const renderer = { render: vi.fn() };
    const particles = { update: vi.fn() };
    const applyParameters = vi.fn();
    const trackingMap = {
      mouthOpen: "mouthOpen",
      mouthWidth: "mouthWidth",
    } as TrackingParameterMap;

    const args = {
        loaded: true,
        lipSync: true,
        lipSyncMode: "viseme" as const,
        setCurrentVowel,
        setHudStats,
        modelRef: { current: model },
        rendererRef: { current: renderer },
        particlesRef: { current: particles },
        applyParameters,
        lipSyncVolumeRef: { current: 0.6 },
        lipSyncVowelRef: { current: "a" as const },
        trackingMapRef: { current: trackingMap },
        showHudRef: { current: false },
        ...overrides,
      } as unknown as Parameters<typeof useViewerLoop>[0];

    return {
      args,
      model,
      renderer,
      particles,
      applyParameters,
      setCurrentVowel,
      setHudStats,
    };
  }

  it("does not schedule frames when the model is not loaded", () => {
    renderHook(() =>
      useViewerLoop(
        buildArgs({
          loaded: false,
        }).args,
      ),
    );

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it("applies viseme mouth parameters and emits the current vowel every tenth frame", () => {
    const { args, model, renderer, particles, applyParameters, setCurrentVowel } =
      buildArgs();

    renderHook(() => useViewerLoop(args));
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) {
      flushFrame(1000 + i * 16);
    }

    expect(applyParameters).toHaveBeenCalledWith({
      mouthOpen: expect.any(Number),
      mouthWidth: expect.any(Number),
    });
    expect(model.update).toHaveBeenCalledTimes(10);
    expect(particles.update).toHaveBeenCalledTimes(10);
    expect(renderer.render).toHaveBeenCalledTimes(10);
    expect(setCurrentVowel).toHaveBeenCalledWith("a");
  });

  it("falls back to RMS lip sync when visemes are not used", () => {
    const { args, applyParameters } = buildArgs({
      lipSyncMode: "rms",
      lipSyncVowelRef: { current: "silent" as const },
      trackingMapRef: { current: { mouthOpen: "jaw" } as TrackingParameterMap },
    });

    renderHook(() => useViewerLoop(args));
    flushFrame(1000);

    expect(applyParameters).toHaveBeenCalledTimes(1);
    expect(applyParameters).toHaveBeenCalledWith({ jaw: 0.6 });
  });

  it("updates HUD stats on the configured cadence", () => {
    const { args, setHudStats } = buildArgs({
      showHudRef: { current: true },
    });

    renderHook(() => useViewerLoop(args));

    for (let i = 0; i < 30; i++) {
      flushFrame(1000 + i * 16);
    }

    expect(setHudStats).toHaveBeenCalledWith({
      fps: 30,
      meshes: 1,
      vertices: 3,
    });
  });

  it("cancels the scheduled frame when the hook unmounts", () => {
    const { args } = buildArgs();
    const { unmount } = renderHook(() => useViewerLoop(args));

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);
  });
});
