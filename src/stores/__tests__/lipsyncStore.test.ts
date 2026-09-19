import { beforeEach, describe, expect, it } from "vitest";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { resetLipSyncStore } from "@/test/store-reset";

describe("lipsyncStore", () => {
  beforeEach(resetLipSyncStore);

  it("reset で全状態をクリアする", () => {
    useLipSyncStore.getState().setVolume(0.5);
    useLipSyncStore.getState().setConnected(true);
    useLipSyncStore.getState().setError("マイクの許可が拒否されました");
    useLipSyncStore.getState().setViseme("aa", 0.95);
    expect(useLipSyncStore.getState()).toMatchObject({
      currentVolume: 0.5,
      isConnected: true,
      error: "マイクの許可が拒否されました",
      currentViseme: "aa",
      visemeConfidence: 0.95,
    });
    useLipSyncStore.getState().setError(null);
    expect(useLipSyncStore.getState().error).toBeNull();
    useLipSyncStore.getState().setError("テストエラー");

    useLipSyncStore.getState().reset();

    const state = useLipSyncStore.getState();
    expect(state.currentVolume).toBe(0);
    expect(state.isConnected).toBe(false);
    expect(state.error).toBeNull();
    expect(state.currentViseme).toBe("sil");
    expect(state.visemeConfidence).toBe(0);
  });
});
