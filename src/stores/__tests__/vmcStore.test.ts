import { beforeEach, describe, expect, it } from "vitest";
import type { VMCMapping } from "@/stores/vmcStore";
import { useVMCStore } from "@/stores/vmcStore";
import { resetVMCStore } from "@/test/store-reset";

beforeEach(() => {
  resetVMCStore();
});

function createMapping(overrides: Partial<VMCMapping> = {}): VMCMapping {
  return {
    vmcName: "FaceChannel_A",
    parameterId: "param-1",
    scale: 1,
    offset: 0,
    ...overrides,
  };
}

describe("vmcStore", () => {
  // ==============================================================
  // setConnected
  // ==============================================================
  describe("setConnected", () => {
    it("接続状態が変更される", () => {
      const { setConnected } = useVMCStore.getState();

      setConnected(true);

      expect(useVMCStore.getState().connected).toBe(true);

      setConnected(false);

      expect(useVMCStore.getState().connected).toBe(false);
    });
  });

  // ==============================================================
  // setReceivePort
  // ==============================================================
  describe("setReceivePort", () => {
    it("ポート番号が変更される", () => {
      const { setReceivePort } = useVMCStore.getState();

      setReceivePort(12345);

      expect(useVMCStore.getState().receivePort).toBe(12345);
    });
  });

  // ==============================================================
  // setSendTarget
  // ==============================================================
  describe("setSendTarget", () => {
    it("ホストとポートが変更される", () => {
      const { setSendTarget } = useVMCStore.getState();

      setSendTarget("192.168.1.100", 54321);

      const state = useVMCStore.getState();
      expect(state.sendHost).toBe("192.168.1.100");
      expect(state.sendPort).toBe(54321);
    });
  });

  // ==============================================================
  // addMapping
  // ==============================================================
  describe("addMapping", () => {
    it("マッピングが追加される", () => {
      const { addMapping } = useVMCStore.getState();
      const mapping = createMapping();

      addMapping(mapping);

      const state = useVMCStore.getState();
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]).toEqual(mapping);
    });
  });

  // ==============================================================
  // removeMapping
  // ==============================================================
  describe("removeMapping", () => {
    it("部分更新と先頭・中間の削除は指定mappingだけを変更する", () => {
      const { addMapping, updateMapping, removeMapping } = useVMCStore.getState();
      const a = createMapping({ vmcName: "A" }),
        b = createMapping({ vmcName: "B" }),
        c = createMapping({ vmcName: "C" });
      for (const mapping of [a, b, c]) addMapping(mapping);
      updateMapping(1, { vmcName: "新しい名前", scale: 2.5 });
      expect(useVMCStore.getState().mappings).toEqual([
        a,
        { ...b, vmcName: "新しい名前", scale: 2.5 },
        c,
      ]);
      removeMapping(1);
      expect(useVMCStore.getState().mappings).toEqual([a, c]);
      updateMapping(0, { scale: 3 });
      expect(useVMCStore.getState().mappings).toEqual([{ ...a, scale: 3 }, c]);
      removeMapping(0);
      expect(useVMCStore.getState().mappings).toEqual([c]);
    });
  });

  // ==============================================================
  // updateMapping
  // ==============================================================

  // ==============================================================
  // updateFaceChannelBuffer
  // ==============================================================
  describe("updateFaceChannelBuffer", () => {
    it("バッファにマージされる", () => {
      const { updateFaceChannelBuffer } = useVMCStore.getState();

      updateFaceChannelBuffer({ eye_l: 0.5, eye_r: 0.8 });
      updateFaceChannelBuffer({ mouth: 1.0, eye_l: 0.3 });

      const state = useVMCStore.getState();
      expect(state.faceChannelBuffer).toEqual({
        eye_l: 0.3,
        eye_r: 0.8,
        mouth: 1.0,
      });
    });
  });

  // ==============================================================
  // markReceived
  // ==============================================================
  describe("markReceived", () => {
    it("lastReceivedAt が更新される", () => {
      const { markReceived } = useVMCStore.getState();
      const before = Date.now();

      markReceived();

      const state = useVMCStore.getState();
      expect(state.lastReceivedAt).not.toBeNull();
      expect(state.lastReceivedAt).toBeGreaterThanOrEqual(before);
      expect(state.lastReceivedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // ==============================================================
  // reset
  // ==============================================================
  describe("reset", () => {
    it("全状態が初期値に戻る", () => {
      const actions = useVMCStore.getState();
      actions.setConnected(true);
      actions.setReceivePort(9999);
      actions.setSendTarget("10.0.0.1", 8888);
      actions.addMapping(createMapping());
      actions.updateFaceChannelBuffer({ test: 1 });
      actions.markReceived();

      actions.reset();

      const state = useVMCStore.getState();
      expect(state.connected).toBe(false);
      expect(state.receivePort).toBe(39539);
      expect(state.sendPort).toBe(39540);
      expect(state.sendHost).toBe("127.0.0.1");
      expect(state.mappings).toEqual([]);
      expect(state.lastReceivedAt).toBeNull();
      expect(state.faceChannelBuffer).toEqual({});
    });
  });

  describe("resetRuntime", () => {
    it("runtime状態（connected/mappings/lastReceivedAt/faceChannelBuffer）のみクリアする", () => {
      const actions = useVMCStore.getState();
      actions.setReceivePort(9999);
      actions.setSendTarget("10.0.0.1", 8888);
      actions.setConnected(true);
      actions.addMapping(createMapping({ vmcName: "A" }));
      actions.addMapping(createMapping({ vmcName: "B" }));
      actions.updateFaceChannelBuffer({ eye_l: 0.5 });
      actions.markReceived();

      actions.resetRuntime();

      const state = useVMCStore.getState();
      expect(state.connected).toBe(false);
      expect(state.mappings).toEqual([]);
      expect(state.lastReceivedAt).toBeNull();
      expect(state.faceChannelBuffer).toEqual({});
      expect(state.receivePort).toBe(9999);
      expect(state.sendHost).toBe("10.0.0.1");
      expect(state.sendPort).toBe(8888);
    });
  });

  describe("resetSettings", () => {
    it("永続設定（ports/host）のみ既定値に戻し runtime は保持する", () => {
      const actions = useVMCStore.getState();
      actions.setReceivePort(9999);
      actions.setSendTarget("10.0.0.1", 8888);
      actions.setConnected(true);
      actions.addMapping(createMapping({ vmcName: "Keep" }));
      actions.updateFaceChannelBuffer({ eye_l: 0.5 });

      actions.resetSettings();

      const state = useVMCStore.getState();
      expect(state.receivePort).toBe(39539);
      expect(state.sendPort).toBe(39540);
      expect(state.sendHost).toBe("127.0.0.1");
      expect(state.connected).toBe(true);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]!.vmcName).toBe("Keep");
      expect(state.faceChannelBuffer).toEqual({ eye_l: 0.5 });
    });
  });

  describe("複数マッピングの順序保持", () => {
    it("追加順序が保持される", () => {
      const { addMapping } = useVMCStore.getState();
      const names = ["Alpha", "Beta", "Gamma", "Delta"];
      for (const name of names) {
        addMapping(createMapping({ vmcName: name }));
      }

      const state = useVMCStore.getState();
      expect(state.mappings).toHaveLength(4);
      expect(state.mappings.map((m) => m.vmcName)).toEqual(names);
    });
  });

  describe("ブランチ網羅", () => {
    it("updateMapping: 存在しないインデックスでも配列サイズは変わらない", () => {
      const { addMapping, updateMapping } = useVMCStore.getState();
      addMapping(createMapping({ vmcName: "Test" }));
      updateMapping(5, { scale: 99 });
      expect(useVMCStore.getState().mappings).toHaveLength(1);
    });

    it("removeMapping: 存在しないインデックスでも安全", () => {
      const { addMapping, removeMapping } = useVMCStore.getState();
      addMapping(createMapping());
      removeMapping(99);
      expect(useVMCStore.getState().mappings).toHaveLength(1);
    });
  });
});
