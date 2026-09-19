import { beforeEach, describe, expect, it } from "vitest";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { resetLipSyncStore } from "@/test/store-reset";

describe("lipsyncStore — setViseme と追加ブランチ", () => {
  beforeEach(resetLipSyncStore);

  it("setViseme は音声変化と無音への復帰でビゼームと信頼度を同時に更新する", () => {
    useLipSyncStore.getState().setViseme("aa", 0.95);

    const state = useLipSyncStore.getState();
    expect(state.currentViseme).toBe("aa");
    expect(state.visemeConfidence).toBe(0.95);
    useLipSyncStore.getState().setViseme("oh", 0.6);
    expect(useLipSyncStore.getState()).toMatchObject({
      currentViseme: "oh",
      visemeConfidence: 0.6,
    });
    useLipSyncStore.getState().setViseme("sil", 0);
    expect(useLipSyncStore.getState()).toMatchObject({
      currentViseme: "sil",
      visemeConfidence: 0,
    });
  });
});
