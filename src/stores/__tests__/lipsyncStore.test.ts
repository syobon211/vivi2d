import { beforeEach, describe, expect, it } from "vitest";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { resetLipSyncStore } from "@/test/store-reset";

describe("lipsyncStore", () => {
  beforeEach(resetLipSyncStore);

  it("初期状態が正しい", () => {
    const state = useLipSyncStore.getState();
    expect(state.currentVolume).toBe(0);
    expect(state.isConnected).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setVolume で音量を設定できる", () => {
    useLipSyncStore.getState().setVolume(0.75);
    expect(useLipSyncStore.getState().currentVolume).toBe(0.75);
  });

  it("setConnected で接続状態を設定できる", () => {
    useLipSyncStore.getState().setConnected(true);
    expect(useLipSyncStore.getState().isConnected).toBe(true);
  });

  it("setError でエラーメッセージを設定できる", () => {
    useLipSyncStore.getState().setError("マイクの許可が拒否されました");
    expect(useLipSyncStore.getState().error).toBe("マイクの許可が拒否されました");
  });

  it("setError で null にクリアできる", () => {
    useLipSyncStore.getState().setError("エラー");
    useLipSyncStore.getState().setError(null);
    expect(useLipSyncStore.getState().error).toBeNull();
  });

  it("reset で全状態をクリアする", () => {
    useLipSyncStore.getState().setVolume(0.5);
    useLipSyncStore.getState().setConnected(true);
    useLipSyncStore.getState().setError("テストエラー");

    useLipSyncStore.getState().reset();

    const state = useLipSyncStore.getState();
    expect(state.currentVolume).toBe(0);
    expect(state.isConnected).toBe(false);
    expect(state.error).toBeNull();
  });
});
