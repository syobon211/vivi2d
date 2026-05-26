import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useViewerApiStatus } from "../hooks/useViewerApiStatus";

type StatusHook = ReturnType<typeof useViewerApiStatus>;

function renderStatusProbe() {
  let latest: StatusHook | null = null;
  function Probe() {
    latest = useViewerApiStatus();
    return (
      <output data-testid="status">
        {JSON.stringify({
          enabled: latest.status.enabled,
          available: latest.available,
          busy: latest.busy,
          error: latest.error,
          pending: latest.status.pendingChallenges?.length ?? 0,
        })}
      </output>
    );
  }

  render(<Probe />);
  return {
    get current() {
      if (!latest) throw new Error("hook not rendered");
      return latest;
    },
  };
}

function setViewerApi(value: unknown) {
  Object.defineProperty(window, "viviAPI", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "viviAPI");
});

describe("useViewerApiStatus", () => {
  it("reports an unavailable bridge and fails commands without throwing", async () => {
    const probe = renderStatusProbe();

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("status").textContent ?? "{}")).toMatchObject({
        enabled: false,
        available: false,
      }),
    );

    await act(async () => {
      await probe.current.setEnabled(true);
    });

    expect(JSON.parse(screen.getByTestId("status").textContent ?? "{}")).toMatchObject({
      enabled: false,
      available: false,
      error: "Viewer API bridge is only available in the Electron viewer.",
    });
  });

  it("refreshes status, handles pushed updates, and wraps bridge commands", async () => {
    let statusListener: ((payload: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    const viewerApi = {
      getStatus: vi
        .fn()
        .mockResolvedValueOnce({ enabled: true, pendingChallenges: [] })
        .mockResolvedValueOnce({ enabled: false, pendingChallenges: [] })
        .mockResolvedValue({ enabled: true, pendingChallenges: [] }),
      onStatusChanged: vi.fn((listener: (payload: unknown) => void) => {
        statusListener = listener;
        return unsubscribe;
      }),
      setEnabled: vi.fn(async () => undefined),
      openPairingWindow: vi.fn(async () => undefined),
      closePairingWindow: vi.fn(async () => undefined),
      approvePairing: vi.fn(async () => undefined),
      revokeGrant: vi.fn(async () => undefined),
      rotateGrant: vi.fn(async () => undefined),
    };
    setViewerApi({ viewerApi });
    const probe = renderStatusProbe();

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("status").textContent ?? "{}")).toMatchObject({
        enabled: true,
        available: true,
      }),
    );

    act(() => {
      statusListener?.({
        enabled: true,
        pendingChallenges: [{ id: "p", scopes: ["read:state"] }],
      });
    });
    expect(JSON.parse(screen.getByTestId("status").textContent ?? "{}")).toMatchObject({
      enabled: true,
      pending: 1,
    });

    await act(async () => {
      await probe.current.setEnabled(false, 5000);
      await probe.current.openPairingWindow(["http://127.0.0.1:4173"]);
      await probe.current.closePairingWindow();
      await probe.current.approvePairing("challenge", "123456");
      await probe.current.revokeGrant("grant");
      await probe.current.rotateGrant("grant");
    });

    expect(viewerApi.setEnabled).toHaveBeenCalledWith({
      enabled: false,
      port: 5000,
    });
    expect(viewerApi.openPairingWindow).toHaveBeenCalledWith({
      durationMs: 90_000,
      origins: ["http://127.0.0.1:4173"],
    });
    expect(viewerApi.approvePairing).toHaveBeenCalledWith({
      challengeId: "challenge",
      code: "123456",
    });
    expect(viewerApi.revokeGrant).toHaveBeenCalledWith({ grantId: "grant" });
    expect(viewerApi.rotateGrant).toHaveBeenCalledWith({ grantId: "grant" });
  });

  it("falls back to polling when the bridge has no status subscription", async () => {
    vi.useFakeTimers();
    const viewerApi = {
      getStatus: vi.fn(async () => ({ enabled: true })),
      setEnabled: vi.fn(async () => undefined),
    };
    setViewerApi({ viewerApi });
    renderStatusProbe();

    await act(async () => {
      await Promise.resolve();
    });
    expect(viewerApi.getStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(viewerApi.getStatus).toHaveBeenCalledTimes(2);
  });
});
