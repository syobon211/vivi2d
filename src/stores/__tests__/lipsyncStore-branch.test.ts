import { beforeEach, describe, expect, it } from "vitest";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { resetLipSyncStore } from "@/test/store-reset";


describe("lipsyncStore — setViseme と追加ブランチ", () => {
  beforeEach(resetLipSyncStore);

  it("setViseme でビゼームと信頼度を同時に設定できる", () => {
    useLipSyncStore.getState().setViseme("aa", 0.95);

    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("aa");
    expect(state.visemeConfidence).toBe(0.95);
  });

  it("setViseme を複数回呼んで別のビゼームに更新できる", () => {
    useLipSyncStore.getState().setViseme("aa", 0.8);
    useLipSyncStore.getState().setViseme("oh", 0.6);

    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("oh");
    expect(state.visemeConfidence).toBe(0.6);
  });

  it("setViseme で sil（無音）に戻せる", () => {
    useLipSyncStore.getState().setViseme("eh", 0.9);
    useLipSyncStore.getState().setViseme("sil", 0);

    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("sil");
    expect(state.visemeConfidence).toBe(0);
  });

  it("reset でビゼーム状態も初期化される", () => {
    useLipSyncStore.getState().setViseme("aa", 0.95);
    useLipSyncStore.getState().setVolume(0.7);
    useLipSyncStore.getState().setConnected(true);

    useLipSyncStore.getState().reset();

    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("sil");
    expect(state.visemeConfidence).toBe(0);
    expect(state.currentVolume).toBe(0);
    expect(state.isConnected).toBe(false);
  });

  it("初期状態のビゼームは sil で信頼度は 0", () => {
    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("sil");
    expect(state.visemeConfidence).toBe(0);
  });
});
