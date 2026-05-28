import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewerApiPublicEvent } from "../api/viewer-api-event-mapper";
import { useViewerApiEventPublisher } from "../hooks/useViewerApiEventPublisher";
import { useViewerApiRendererBridge } from "../hooks/useViewerApiRendererBridge";

function installViewerApiBridge(overrides: Record<string, unknown> = {}) {
  const viewerApi = {
    getStatus: vi.fn(async () => ({})),
    setEnabled: vi.fn(async () => ({})),
    openPairingWindow: vi.fn(async () => ({})),
    closePairingWindow: vi.fn(async () => ({})),
    listGrants: vi.fn(async () => []),
    approvePairing: vi.fn(async () => ({})),
    revokeGrant: vi.fn(async () => true),
    rotateGrant: vi.fn(async () => ({})),
    publishEvent: vi.fn(async () => 0),
    respondRendererRequest: vi.fn(async () => true),
    createPropAsset: vi.fn(async () => ({})),
    listPropAssets: vi.fn(async () => []),
    extendPropAsset: vi.fn(async () => ({})),
    revokePropAsset: vi.fn(async () => true),
    onStatusChanged: vi.fn(() => () => {}),
    onAssetStatusChanged: vi.fn(() => () => {}),
    onRendererRequest: vi.fn(() => () => {}),
    ...overrides,
  };
  window.viviAPI = {
    setBackgroundMode: vi.fn(async () => {}),
    toggleAlwaysOnTop: vi.fn(async () => false),
    toggleFrame: vi.fn(async () => {}),
    setWindowSize: vi.fn(async () => {}),
    onBackgroundModeChanged: vi.fn(() => () => {}),
    viewerApi,
  };
  return viewerApi;
}

function makeEvent(index: number): ViewerApiPublicEvent {
  return {
    name: `viewer.test.${index}`,
    timestamp: 1000 + index,
    data: { index },
  };
}

describe("useViewerApiEventPublisher", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  });

  it("coalesces public Viewer API events onto the next animation frame", () => {
    const bridge = installViewerApiBridge();
    let publish: ReturnType<typeof useViewerApiEventPublisher> | null = null;
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 42;
    });

    function Probe() {
      publish = useViewerApiEventPublisher();
      return null;
    }

    render(<Probe />);
    act(() => {
      publish?.([makeEvent(1), makeEvent(2)]);
    });

    expect(bridge.publishEvent).not.toHaveBeenCalled();
    act(() => {
      frameCallback?.(16);
    });

    expect(bridge.publishEvent).toHaveBeenCalledTimes(2);
    expect(bridge.publishEvent).toHaveBeenNthCalledWith(1, makeEvent(1));
    expect(bridge.publishEvent).toHaveBeenNthCalledWith(2, makeEvent(2));
  });

  it("drops the oldest pending events before publishing more than the queue limit", () => {
    const bridge = installViewerApiBridge();
    let publish: ReturnType<typeof useViewerApiEventPublisher> | null = null;
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 7;
    });

    function Probe() {
      publish = useViewerApiEventPublisher();
      return null;
    }

    render(<Probe />);
    act(() => {
      publish?.(Array.from({ length: 520 }, (_, index) => makeEvent(index)));
    });
    act(() => {
      frameCallback?.(16);
    });

    expect(bridge.publishEvent).toHaveBeenCalledTimes(128);
    expect(bridge.publishEvent).toHaveBeenNthCalledWith(1, makeEvent(8));
  });
});

describe("useViewerApiRendererBridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as typeof window & { viviAPI?: unknown }).viviAPI;
  });

  function makeController(overrides: Partial<{
    snapshot: () => unknown;
    dispatch: (command: unknown) => Promise<{ accepted: boolean; reason?: string }>;
  }> = {}) {
    return {
      snapshot:
        overrides.snapshot ??
        vi.fn(() => ({
          props: [
            {
              id: "prop-1",
              name: "Hat",
              kind: "image",
              visible: true,
              drawOrder: 100,
              opacity: 1,
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              groupId: "outfit",
              anchor: undefined,
              source: {
                kind: "inlineBase64",
                mimeType: "image/png",
                bytes: "AAAA",
                portable: true,
              },
            },
          ],
          calibration: {
            activeProfileId: "default",
            profiles: [],
            diagnostics: [],
          },
        })),
      dispatch: overrides.dispatch ?? vi.fn(async () => ({ accepted: true })),
    };
  }

  it("registers renderer requests and publishes public prop snapshots", async () => {
    let handler: ((payload: unknown) => void) | undefined;
    const respondRendererRequest = vi.fn(async () => true);
    installViewerApiBridge({
      respondRendererRequest,
      onRendererRequest: vi.fn((callback: (payload: unknown) => void) => {
        handler = callback;
        return () => {};
      }),
    });
    const controller = makeController();

    function Probe() {
      useViewerApiRendererBridge(controller as never);
      return null;
    }

    render(<Probe />);
    act(() => {
      handler?.({
        requestId: "req-1",
        type: "viewer.props.list",
        data: {},
        scopes: [],
      });
    });

    await waitFor(() => {
      expect(respondRendererRequest).toHaveBeenCalledWith({
        requestId: "req-1",
        ok: true,
        data: {
          props: [
            expect.objectContaining({
              id: "prop-1",
              name: "Hat",
              source: expect.objectContaining({ portable: true, bytes: 3 }),
            }),
          ],
        },
      });
    });
  });

  it("ignores malformed renderer bridge payloads before dispatching", () => {
    let handler: ((payload: unknown) => void) | undefined;
    const respondRendererRequest = vi.fn(async () => true);
    installViewerApiBridge({
      respondRendererRequest,
      onRendererRequest: vi.fn((callback: (payload: unknown) => void) => {
        handler = callback;
        return () => {};
      }),
    });
    const controller = makeController();

    function Probe() {
      useViewerApiRendererBridge(controller as never);
      return null;
    }

    render(<Probe />);
    act(() => {
      handler?.({ requestId: "bad", type: "viewer.props.list", data: {} });
    });

    expect(respondRendererRequest).not.toHaveBeenCalled();
  });

  it("normalizes renderer request failures into bounded responses", async () => {
    let handler: ((payload: unknown) => void) | undefined;
    const respondRendererRequest = vi.fn(async () => true);
    installViewerApiBridge({
      respondRendererRequest,
      onRendererRequest: vi.fn((callback: (payload: unknown) => void) => {
        handler = callback;
        return () => {};
      }),
    });
    const controller = makeController();

    function Probe() {
      useViewerApiRendererBridge(controller as never);
      return null;
    }

    render(<Probe />);
    act(() => {
      handler?.({
        requestId: "req-error",
        type: "viewer.prop.load",
        data: { source: { kind: "inlineBase64", mimeType: "text/plain", bytes: "x" } },
        scopes: ["write:props"],
      });
    });

    await waitFor(() => {
      expect(respondRendererRequest).toHaveBeenCalledWith({
        requestId: "req-error",
        ok: false,
        data: {},
        reason: "invalid inline prop source",
      });
    });
  });
});
