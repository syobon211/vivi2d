import {
  type OSCMessage,
  parseOSCMessage,
  parseVMCFaceChannel,
  parseVMCBonePos,
  serializeOSCMessage,
} from "@vivi2d/core/vmc-protocol";
import { describe, expect, it } from "vitest";

describe("OSC パーサー/シリアライザー", () => {
  it("シリアライズしたメッセージをパースして元に戻せる（整数引数）", () => {
    const msg: OSCMessage = {
      address: "/test/int",
      args: [{ type: "i", value: 42 }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe("/test/int");
    expect(parsed!.args).toHaveLength(1);
    expect(parsed!.args[0]).toEqual({ type: "i", value: 42 });
  });

  it("float引数のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/test/float",
      args: [{ type: "f", value: 3.14 }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!.type).toBe("f");
    expect((parsed!.args[0]! as { type: "f"; value: number }).value).toBeCloseTo(3.14, 2);
  });

  it("string引数のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/test/string",
      args: [{ type: "s", value: "hello" }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!).toEqual({ type: "s", value: "hello" });
  });

  it("複数引数のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "s", value: "Joy" },
        { type: "f", value: 0.75 },
      ],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe("/VMC/Ext/Blend/Val");
    expect(parsed!.args).toHaveLength(2);
    expect(parsed!.args[0]!).toEqual({ type: "s", value: "Joy" });
    expect((parsed!.args[1]! as { type: "f"; value: number }).value).toBeCloseTo(0.75, 5);
  });

  it("blob引数のラウンドトリップ", () => {
    const blob = new Uint8Array([1, 2, 3, 4, 5]);
    const msg: OSCMessage = {
      address: "/test/blob",
      args: [{ type: "b", value: blob }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!.type).toBe("b");
    const parsedBlob = (parsed!.args[0]! as { type: "b"; value: Uint8Array }).value;
    expect(Array.from(parsedBlob)).toEqual([1, 2, 3, 4, 5]);
  });

  it("引数なしのメッセージ", () => {
    const msg: OSCMessage = { address: "/ping", args: [] };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe("/ping");
    expect(parsed!.args).toHaveLength(0);
  });

  it("不正なバイナリで null を返す", () => {
    const garbage = new ArrayBuffer(4);
    new DataView(garbage).setUint32(0, 0xdeadbeef);
    expect(parseOSCMessage(garbage)).toBeNull();
  });
});

describe("VMC メッセージ解釈", () => {
  it("ブレンドシェイプメッセージをパースする", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "s", value: "Blink_L" },
        { type: "f", value: 0.8 },
      ],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Blink_L");
    expect(result!.value).toBeCloseTo(0.8, 5);
  });

  it("アドレスが異なる場合は null", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "test" },
        { type: "f", value: 1 },
      ],
    };
    expect(parseVMCFaceChannel(msg)).toBeNull();
  });

  it("ボーンポジションメッセージをパースする", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.0 },
        { type: "f", value: Math.SQRT1_2 },
        { type: "f", value: 0.0 },
        { type: "f", value: Math.SQRT1_2 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Head");
    expect(result!.posX).toBeCloseTo(0.1, 3);
    expect(result!.posY).toBeCloseTo(0.2, 3);
    expect(result!.rotY).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("引数不足のボーンメッセージで null", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "f", value: 0.1 },
      ],
    };
    expect(parseVMCBonePos(msg)).toBeNull();
  });
});
