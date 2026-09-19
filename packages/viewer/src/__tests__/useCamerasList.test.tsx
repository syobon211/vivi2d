import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCamerasList } from "../hooks/useCamerasList";
import { FaceTracker } from "../tracking/face-tracker";

describe("useCamerasList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listCameras が解決したら結果を cameras に返す", async () => {
    const fakeDevice = {
      deviceId: "cam1",
      kind: "videoinput",
      label: "Test Cam",
      groupId: "g1",
      toJSON: () => ({}),
    } as unknown as MediaDeviceInfo;
    const spy = vi.spyOn(FaceTracker, "listCameras").mockResolvedValue([fakeDevice]);

    const { result } = renderHook(() => useCamerasList());

    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(1);
    });
    expect(result.current.cameras[0]?.deviceId).toBe("cam1");
    expect(result.current.error).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("listCameras が reject したら error に Error を格納し cameras は空配列", async () => {
    vi.spyOn(FaceTracker, "listCameras").mockRejectedValue(
      new Error("permission denied"),
    );

    const { result } = renderHook(() => useCamerasList());

    expect(result.current.cameras).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.cameras).toEqual([]);
    expect(result.current.error?.message).toBe("permission denied");
  });

  it("非 Error を reject しても Error でラップされる", async () => {
    vi.spyOn(FaceTracker, "listCameras").mockRejectedValue("string-error");

    const { result } = renderHook(() => useCamerasList());

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("string-error");
  });

  it.each([
    "resolve",
    "reject",
  ] as const)("StrictMode cleanup rejects a stale %s without overwriting the active result", async (completion) => {
    let resolveStale!: (devices: MediaDeviceInfo[]) => void;
    let rejectStale!: (error: Error) => void;
    let resolveActive!: (devices: MediaDeviceInfo[]) => void;
    vi.spyOn(FaceTracker, "listCameras")
      .mockImplementationOnce(
        () =>
          new Promise<MediaDeviceInfo[]>((resolve, reject) => {
            resolveStale = resolve;
            rejectStale = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<MediaDeviceInfo[]>((resolve) => {
            resolveActive = resolve;
          }),
      );
    const active = { deviceId: "active" } as MediaDeviceInfo;
    const stale = { deviceId: "stale" } as MediaDeviceInfo;
    const { result } = renderHook(() => useCamerasList(), { wrapper: StrictMode });
    await act(async () => resolveActive([active]));
    expect(result.current.cameras).toEqual([active]);
    await act(async () => {
      if (completion === "resolve") resolveStale([stale]);
      else rejectStale(new Error("stale permission failure"));
    });
    expect(result.current.cameras).toEqual([active]);
    expect(result.current.error).toBeNull();
  });
});
