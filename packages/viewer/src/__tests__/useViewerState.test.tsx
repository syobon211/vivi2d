import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewerState } from "../hooks/useViewerState";


const STORAGE_KEY = "vivi-viewer-settings";

describe("useViewerState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("初期値", () => {
    it("公開stateとmapping refsの初期値を保持する", () => {
      const { result } = renderHook(() => useViewerState());
      expect(result.current.loaded).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.dragging).toBe(false);
      expect(result.current.modelName).toBe("");
      expect(result.current.tracking).toBe(false);
      expect(result.current.handTracking).toBe(false);
      expect(result.current.poseTracking).toBe(false);
      expect(result.current.lipSync).toBe(false);
      expect(result.current.mappedCount).toBe(0);
      expect(result.current.platformFaceMappedCount).toBe(0);
      expect(result.current.handMappedCount).toBe(0);
      expect(result.current.poseMappedCount).toBe(0);
      expect(result.current.showHud).toBe(false);
      expect(result.current.hudStats).toEqual({ fps: 0, meshes: 0, vertices: 0 });
      expect(result.current.panelOpen).toBe(false);
      expect(result.current.currentVowel).toBe("silent");
      expect(result.current.recordingState).toBe("idle");
      expect(result.current.recordingElapsed).toBe(0);
      expect(result.current.gamepadActive).toBe(false);
      expect(result.current.midiActive).toBe(false);
      expect(result.current.trackingMapRef.current).toEqual({});
      expect(result.current.platformFaceMapRef.current).toEqual({});
      expect(result.current.handTrackingMapRef.current).toEqual({});
      expect(result.current.poseTrackingMapRef.current).toEqual({});
    });


  });

  describe("settings からの復元", () => {
    it("localStorage に値があれば bgMode/smoothing/colliderEffects を復元", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bgMode: "green",
          smoothing: 0.3,
          cameraDeviceId: "cam-xyz",
          alwaysOnTop: true,
          lipSyncMode: "viseme",
          recordingFormat: "mp4",
          colliderEffects: false,
        }),
      );
      const { result } = renderHook(() => useViewerState());
      expect(result.current.bgMode).toBe("green");
      expect(result.current.smoothing).toBe(0.3);
      expect(result.current.alwaysOnTop).toBe(true);
      expect(result.current.selectedCamera).toBe("cam-xyz");
      expect(result.current.lipSyncMode).toBe("viseme");
      expect(result.current.recordingFormat).toBe("mp4");
      expect(result.current.colliderEffects).toBe(false);
    });

    it("localStorage が空ならデフォルト設定を採用", () => {
      const { result } = renderHook(() => useViewerState());
      expect(result.current.initialSettings).toBeDefined();
      expect(result.current.initialSettings.smoothing).toBe(0.6);
      expect(result.current.bgMode).toBe("transparent");
      expect(result.current.smoothing).toBe(0.6);
      expect(result.current.alwaysOnTop).toBe(false);
      expect(result.current.lipSyncMode).toBe("rms");
      expect(result.current.recordingFormat).toBe("webm");
      expect(result.current.colliderEffects).toBe(true);
    });


  });

  describe("setter 動作", () => {
    it("公開setterと外部mapping-ref書込がそれぞれのstateへ反映される", () => {
      const { result } = renderHook(() => useViewerState());
      act(() => result.current.setLoaded(true));
      expect(result.current.loaded).toBe(true);
      act(() => result.current.setError("読込失敗"));
      expect(result.current.error).toBe("読込失敗");
      act(() => result.current.setError(null));
      expect(result.current.error).toBeNull();
      act(() => {
        result.current.setTracking(true);
        result.current.setHandTracking(true);
        result.current.setPoseTracking(true);
        result.current.setLipSync(true);
      });
      expect(result.current.tracking).toBe(true);
      expect(result.current.handTracking).toBe(true);
      expect(result.current.poseTracking).toBe(true);
      expect(result.current.lipSync).toBe(true);
      act(() => {
        result.current.setBgMode("blue");
        result.current.setAlwaysOnTop(true);
        result.current.setSmoothing(0.9);
      });
      expect(result.current.bgMode).toBe("blue");
      expect(result.current.alwaysOnTop).toBe(true);
      expect(result.current.smoothing).toBe(0.9);
      act(() => {
        result.current.setRecordingState("recording");
        result.current.setRecordingElapsed(1500);
      });
      expect(result.current.recordingState).toBe("recording");
      expect(result.current.recordingElapsed).toBe(1500);
      act(() => result.current.setHudStats({ fps: 60, meshes: 5, vertices: 1024 }));
      expect(result.current.hudStats).toEqual({ fps: 60, meshes: 5, vertices: 1024 });
      act(() => {
        result.current.setMappedCount(3);
        result.current.setPlatformFaceMappedCount(7);
        result.current.setHandMappedCount(2);
        result.current.setPoseMappedCount(11);
      });
      expect(result.current.mappedCount).toBe(3);
      expect(result.current.platformFaceMappedCount).toBe(7);
      expect(result.current.handMappedCount).toBe(2);
      expect(result.current.poseMappedCount).toBe(11);
      act(() => {
        result.current.trackingMapRef.current = { eyeBlinkLeft: "p1" } as never;
      });
      expect(result.current.trackingMapRef.current).toEqual({ eyeBlinkLeft: "p1" });
    });


  });

  describe("ref 同期", () => {
    it("smoothing 変更で smoothingRef.current が同期される", () => {
      const { result } = renderHook(() => useViewerState());
      expect(result.current.smoothingRef.current).toBe(0.6);
      act(() => result.current.setSmoothing(0.25));
      expect(result.current.smoothingRef.current).toBe(0.25);
    });

    it("showHud 変更で showHudRef.current が同期される", () => {
      const { result } = renderHook(() => useViewerState());
      expect(result.current.showHudRef.current).toBe(false);
      act(() => result.current.setShowHud(true));
      expect(result.current.showHudRef.current).toBe(true);
      act(() => result.current.setShowHud(false));
      expect(result.current.showHudRef.current).toBe(false);
    });
  });

});
