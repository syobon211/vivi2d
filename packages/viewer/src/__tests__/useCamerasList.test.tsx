import { renderHook, waitFor } from "@testing-library/react";
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

  it("マウント時に FaceTracker.listCameras を呼び出す", async () => {
    const spy = vi.spyOn(FaceTracker, "listCameras").mockResolvedValue([]);
    renderHook(() => useCamerasList());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("listCameras が解決したら結果を cameras に返す", async () => {
    const fakeDevice = {
      deviceId: "cam1",
      kind: "videoinput",
      label: "Test Cam",
      groupId: "g1",
      toJSON: () => ({}),
    } as unknown as MediaDeviceInfo;
    vi.spyOn(FaceTracker, "listCameras").mockResolvedValue([fakeDevice]);

    const { result } = renderHook(() => useCamerasList());

    await waitFor(() => {
      expect(result.current.cameras).toHaveLength(1);
    });
    expect(result.current.cameras[0]?.deviceId).toBe("cam1");
    expect(result.current.error).toBeNull();
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

  it("初期値は cameras=[] かつ error=null", () => {
    vi.spyOn(FaceTracker, "listCameras").mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useCamerasList());
    expect(result.current.cameras).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("StrictMode 二重 mount でも安全に動作する", async () => {
    const spy = vi.spyOn(FaceTracker, "listCameras").mockResolvedValue([]);
    renderHook(() => useCamerasList(), { wrapper: StrictMode });
    await waitFor(() => {
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("unmount 前に promise が解決しても state 更新しない（リーク対策）", async () => {
    let resolveFn: (v: MediaDeviceInfo[]) => void = () => {};
    vi.spyOn(FaceTracker, "listCameras").mockImplementation(
      () =>
        new Promise<MediaDeviceInfo[]>((r) => {
          resolveFn = r;
        }),
    );
    const { result, unmount } = renderHook(() => useCamerasList());
    expect(result.current.cameras).toEqual([]);

    unmount();

    const fakeDevice = {
      deviceId: "late",
      kind: "videoinput",
      label: "Late",
      groupId: "g",
      toJSON: () => ({}),
    } as unknown as MediaDeviceInfo;
    resolveFn([fakeDevice]);
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.cameras).toEqual([]);
  });

  it("unmount 前に promise が reject しても error をセットしない", async () => {
    let rejectFn: (e: Error) => void = () => {};
    vi.spyOn(FaceTracker, "listCameras").mockImplementation(
      () =>
        new Promise<MediaDeviceInfo[]>((_, r) => {
          rejectFn = r;
        }),
    );
    const { result, unmount } = renderHook(() => useCamerasList());
    expect(result.current.error).toBeNull();

    unmount();
    rejectFn(new Error("late error"));
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });
});
