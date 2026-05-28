import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLipSync } from "@/hooks/useLipSync";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { createProject } from "@/test/fixtures";
import { resetEditorStore, resetLipSyncStore } from "@/test/store-reset";

describe("useLipSync", () => {
  beforeEach(() => {
    resetEditorStore();
    resetLipSyncStore();
  });

  it("プロジェクトなしでもエラーにならない", () => {
    expect(() => renderHook(() => useLipSync())).not.toThrow();
  });

  it("リップシンク無効時は接続しない", () => {
    const project = createProject({
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
    });
    useEditorStore.setState({ project });
    renderHook(() => useLipSync());

    expect(useLipSyncStore.getState().isConnected).toBe(false);
  });

  it("リップシンク有効時にマイクに接続する", async () => {
    const project = createProject({
      lipsyncConfig: {
        enabled: true,
        targetParameterId: "mouth",
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
    });
    useEditorStore.setState({ project });

    renderHook(() => useLipSync());

    await vi.waitFor(() => {
      expect(useLipSyncStore.getState().isConnected).toBe(true);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("アンマウント時にリソースを解放する", async () => {
    const project = createProject({
      lipsyncConfig: {
        enabled: true,
        targetParameterId: "mouth",
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
    });
    useEditorStore.setState({ project });

    const { unmount } = renderHook(() => useLipSync());

    await vi.waitFor(() => {
      expect(useLipSyncStore.getState().isConnected).toBe(true);
    });

    unmount();
    expect(useLipSyncStore.getState().isConnected).toBe(false);
    expect(useLipSyncStore.getState().currentVolume).toBe(0);
  });

  it("enabled を false にするとリセットされる", async () => {
    const project = createProject({
      lipsyncConfig: {
        enabled: true,
        targetParameterId: "mouth",
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
    });
    useEditorStore.setState({ project });

    const { rerender } = renderHook(() => useLipSync());

    await vi.waitFor(() => {
      expect(useLipSyncStore.getState().isConnected).toBe(true);
    });

    useEditorStore.setState({
      project: {
        ...project,
        lipsyncConfig: { ...project.lipsyncConfig, enabled: false },
      },
    });
    rerender();

    expect(useLipSyncStore.getState().isConnected).toBe(false);
  });

  it("マイク接続失敗時にエラーを設定する", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("Permission denied"),
    );

    const project = createProject({
      lipsyncConfig: {
        enabled: true,
        targetParameterId: "mouth",
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2.0,
      },
    });
    useEditorStore.setState({ project });

    renderHook(() => useLipSync());

    await vi.waitFor(() => {
      expect(useLipSyncStore.getState().error).toBe("Permission denied");
    });

    expect(useLipSyncStore.getState().isConnected).toBe(false);
  });
});
