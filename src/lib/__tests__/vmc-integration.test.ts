
import type { OSCMessage } from "@vivi2d/core/vmc-protocol";
import {
  parseOSCMessage,
  parseVMCFaceChannel,
  parseVMCBonePos,
  serializeOSCMessage,
} from "@vivi2d/core/vmc-protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { VMCMapping } from "@/stores/vmcStore";
import { useVMCStore } from "@/stores/vmcStore";
import { resetAllStores } from "@/test/store-reset";

function createFaceChannelOSC(name: string, value: number): OSCMessage {
  return {
    address: "/VMC/Ext/Blend/Val",
    args: [
      { type: "s", value: name },
      { type: "f", value },
    ],
  };
}

function createBonePosOSC(
  name: string,
  pos: [number, number, number],
  rot: [number, number, number, number],
): OSCMessage {
  return {
    address: "/VMC/Ext/Bone/Pos",
    args: [
      { type: "s", value: name },
      { type: "f", value: pos[0] },
      { type: "f", value: pos[1] },
      { type: "f", value: pos[2] },
      { type: "f", value: rot[0] },
      { type: "f", value: rot[1] },
      { type: "f", value: rot[2] },
      { type: "f", value: rot[3] },
    ],
  };
}

function applyVMCMappings(
  faceChannelBuffer: Record<string, number>,
  mappings: VMCMapping[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const mapping of mappings) {
    const vmcValue = faceChannelBuffer[mapping.vmcName];
    if (vmcValue !== undefined) {
      result[mapping.parameterId] = vmcValue * mapping.scale + mapping.offset;
    }
  }
  return result;
}

describe("VMC連携統合テスト", () => {
  beforeEach(() => {
    resetAllStores();
  });

  describe("OSCメッセージのフルパイプライン", () => {
    it("OSCメッセージをシリアライズ→パース→VMC解釈→ストアに反映", () => {
      const originalMsg = createFaceChannelOSC("Joy", 0.85);

      const binary = serializeOSCMessage(originalMsg);
      expect(binary).toBeInstanceOf(ArrayBuffer);
      expect(binary.byteLength).toBeGreaterThan(0);

      const parsed = parseOSCMessage(binary);
      expect(parsed).not.toBeNull();
      expect(parsed!.address).toBe("/VMC/Ext/Blend/Val");
      expect(parsed!.args).toHaveLength(2);

      const faceChannel = parseVMCFaceChannel(parsed!);
      expect(faceChannel).not.toBeNull();
      expect(faceChannel!.name).toBe("Joy");
      expect(faceChannel!.value).toBeCloseTo(0.85, 2);

      const vmcStore = useVMCStore.getState();
      vmcStore.setConnected(true);
      vmcStore.updateFaceChannelBuffer({ [faceChannel!.name]: faceChannel!.value });
      vmcStore.markReceived();

      const state = useVMCStore.getState();
      expect(state.connected).toBe(true);
      expect(state.faceChannelBuffer.Joy).toBeCloseTo(0.85, 2);
      expect(state.lastReceivedAt).not.toBeNull();
    });

    it("ボーン位置のOSCメッセージをシリアライズ→パース→VMC解釈", () => {
      const msg = createBonePosOSC(
        "Head",
        [0.1, 0.2, 0.3],
        [0.0, Math.SQRT1_2, 0.0, Math.SQRT1_2],
      );

      const binary = serializeOSCMessage(msg);
      const parsed = parseOSCMessage(binary);
      expect(parsed).not.toBeNull();

      const bonePos = parseVMCBonePos(parsed!);
      expect(bonePos).not.toBeNull();
      expect(bonePos!.name).toBe("Head");
      expect(bonePos!.posX).toBeCloseTo(0.1, 2);
      expect(bonePos!.posY).toBeCloseTo(0.2, 2);
      expect(bonePos!.posZ).toBeCloseTo(0.3, 2);
      expect(bonePos!.rotY).toBeCloseTo(Math.SQRT1_2, 2);
      expect(bonePos!.rotW).toBeCloseTo(Math.SQRT1_2, 2);
    });
  });

  describe("ブレンドシェイプ値の受信→バッファ更新→マッピング経由でパラメータ変換", () => {
    it("マッピングを設定してブレンドシェイプ値をパラメータ値に変換する", () => {
      const vmcStore = useVMCStore.getState();

      vmcStore.addMapping({
        vmcName: "Joy",
        parameterId: "param-mouth-open",
        scale: 30,
        offset: 0,
      });

      vmcStore.updateFaceChannelBuffer({ Joy: 0.5 });

      const state = useVMCStore.getState();
      const params = applyVMCMappings(state.faceChannelBuffer, state.mappings);

      expect(params["param-mouth-open"]).toBeCloseTo(15, 1); // 0.5 * 30 + 0 = 15
    });

    it("スケールとオフセットが正しく適用される", () => {
      const vmcStore = useVMCStore.getState();

      vmcStore.addMapping({
        vmcName: "A",
        parameterId: "param-a",
        scale: 2,
        offset: -1,
      });

      vmcStore.updateFaceChannelBuffer({ A: 0.75 });

      const state = useVMCStore.getState();
      const params = applyVMCMappings(state.faceChannelBuffer, state.mappings);

      // 0.75 * 2 + (-1) = 0.5
      expect(params["param-a"]).toBeCloseTo(0.5, 4);
    });
  });

  describe("複数のVMCメッセージを連続処理してバッファが正しくマージされるか", () => {
    it("連続する複数のブレンドシェイプメッセージがバッファにマージされる", () => {
      const vmcStore = useVMCStore.getState();
      vmcStore.setConnected(true);

      const messages = [
        createFaceChannelOSC("Joy", 0.5),
        createFaceChannelOSC("Angry", 0.3),
        createFaceChannelOSC("Blink_L", 1.0),
        createFaceChannelOSC("Joy", 0.8),
      ];

      for (const msg of messages) {
        const binary = serializeOSCMessage(msg);
        const parsed = parseOSCMessage(binary);
        expect(parsed).not.toBeNull();

        const bs = parseVMCFaceChannel(parsed!);
        if (bs) {
          vmcStore.updateFaceChannelBuffer({ [bs.name]: bs.value });
        }
      }

      const state = useVMCStore.getState();
      expect(state.faceChannelBuffer.Joy).toBeCloseTo(0.8, 2);
      expect(state.faceChannelBuffer.Angry).toBeCloseTo(0.3, 2);
      expect(state.faceChannelBuffer.Blink_L).toBeCloseTo(1.0, 2);
    });

    it("異なるアドレスのメッセージが混在しても正しく処理される", () => {
      const blendMsg = createFaceChannelOSC("A", 0.5);
      const boneMsg = createBonePosOSC("Head", [0, 1, 0], [0, 0, 0, 1]);

      const blendBinary = serializeOSCMessage(blendMsg);
      const boneBinary = serializeOSCMessage(boneMsg);

      const parsedBlend = parseOSCMessage(blendBinary);
      const parsedBone = parseOSCMessage(boneBinary);

      expect(parseVMCFaceChannel(parsedBlend!)).not.toBeNull();
      expect(parseVMCBonePos(parsedBlend!)).toBeNull();

      expect(parseVMCBonePos(parsedBone!)).not.toBeNull();
      expect(parseVMCFaceChannel(parsedBone!)).toBeNull();
    });
  });

  describe("接続→受信→切断のライフサイクル", () => {
    it("接続→受信→切断のフルライフサイクル", () => {
      const vmcStore = useVMCStore.getState();

      let state = useVMCStore.getState();
      expect(state.connected).toBe(false);
      expect(state.lastReceivedAt).toBeNull();
      expect(Object.keys(state.faceChannelBuffer)).toHaveLength(0);

      vmcStore.setConnected(true);
      vmcStore.setReceivePort(39539);
      state = useVMCStore.getState();
      expect(state.connected).toBe(true);
      expect(state.receivePort).toBe(39539);

      vmcStore.updateFaceChannelBuffer({ Joy: 0.5 });
      vmcStore.markReceived();
      state = useVMCStore.getState();
      expect(state.faceChannelBuffer.Joy).toBeCloseTo(0.5, 2);
      expect(state.lastReceivedAt).not.toBeNull();

      vmcStore.setConnected(false);
      state = useVMCStore.getState();
      expect(state.connected).toBe(false);
      expect(state.faceChannelBuffer.Joy).toBeCloseTo(0.5, 2);

      vmcStore.reset();
      state = useVMCStore.getState();
      expect(state.connected).toBe(false);
      expect(state.lastReceivedAt).toBeNull();
      expect(Object.keys(state.faceChannelBuffer)).toHaveLength(0);
      expect(state.mappings).toHaveLength(0);
    });
  });

  describe("マッピング設定変更後の値変換", () => {
    it("マッピング設定変更後の値変換が正しい", () => {
      const vmcStore = useVMCStore.getState();

      vmcStore.addMapping({
        vmcName: "Joy",
        parameterId: "param-joy",
        scale: 1,
        offset: 0,
      });

      vmcStore.updateFaceChannelBuffer({ Joy: 0.5 });

      let state = useVMCStore.getState();
      let params = applyVMCMappings(state.faceChannelBuffer, state.mappings);
      expect(params["param-joy"]).toBeCloseTo(0.5, 4);

      vmcStore.updateMapping(0, { scale: 2, offset: 0.1 });

      state = useVMCStore.getState();
      params = applyVMCMappings(state.faceChannelBuffer, state.mappings);
      expect(params["param-joy"]).toBeCloseTo(1.1, 4);
    });

    it("マッピングの追加・削除が正しく動作する", () => {
      const vmcStore = useVMCStore.getState();

      vmcStore.addMapping({
        vmcName: "A",
        parameterId: "p1",
        scale: 1,
        offset: 0,
      });
      vmcStore.addMapping({
        vmcName: "B",
        parameterId: "p2",
        scale: 1,
        offset: 0,
      });

      let state = useVMCStore.getState();
      expect(state.mappings).toHaveLength(2);

      vmcStore.removeMapping(0);
      state = useVMCStore.getState();
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0]!.vmcName).toBe("B");
    });

    it("送信先設定が正しく更新される", () => {
      const vmcStore = useVMCStore.getState();

      vmcStore.setSendTarget("192.168.1.100", 39540);

      const state = useVMCStore.getState();
      expect(state.sendHost).toBe("192.168.1.100");
      expect(state.sendPort).toBe(39540);
    });
  });
});
