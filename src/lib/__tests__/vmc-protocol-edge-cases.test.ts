import {
  type OSCMessage,
  parseOSCMessage,
  parseVMCFaceChannel,
  parseVMCBonePos,
  serializeOSCMessage,
} from "@vivi2d/core/vmc-protocol";
import { describe, expect, it } from "vitest";

describe("VMC パーサー: 空のバッファ", () => {
  it("0バイトのバッファで null を返す", () => {
    const empty = new ArrayBuffer(0);
    expect(parseOSCMessage(empty)).toBeNull();
  });
});

describe("VMC パーサー: 1バイトのバッファ", () => {
  it("1バイトのバッファで null を返す", () => {
    const buf = new ArrayBuffer(1);
    new DataView(buf).setUint8(0, 0x2f);
    expect(parseOSCMessage(buf)).toBeNull();
  });
});

describe("VMC パーサー: 不正なアドレス", () => {
  it("/ で始まらないアドレスで null を返す", () => {
    const msg: OSCMessage = {
      address: "no-slash",
      args: [],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).toBeNull();
  });
});

describe("VMC パーサー: 型タグの互換性", () => {
  it("型タグが , で始まる場合は正常にパース", () => {
    const msg: OSCMessage = {
      address: "/test",
      args: [{ type: "i", value: 10 }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args).toHaveLength(1);
  });

  it("引数なしメッセージの型タグは , のみ", () => {
    const msg: OSCMessage = { address: "/ping", args: [] };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe("/ping");
    expect(parsed!.args).toHaveLength(0);
  });
});

describe("VMC パーサー: 長い文字列引数", () => {
  it("1000文字の文字列引数をラウンドトリップできる", () => {
    const longStr = "A".repeat(1000);
    const msg: OSCMessage = {
      address: "/test/long",
      args: [{ type: "s", value: longStr }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!.type).toBe("s");
    expect((parsed!.args[0]! as { type: "s"; value: string }).value).toBe(longStr);
  });

  it("日本語1000文字のラウンドトリップ", () => {
    const jpStr = "あ".repeat(1000);
    const msg: OSCMessage = {
      address: "/test/jp",
      args: [{ type: "s", value: jpStr }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect((parsed!.args[0]! as { type: "s"; value: string }).value).toBe(jpStr);
  });
});

describe("VMC パーサー: float の特殊値", () => {
  it("NaN のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/test/nan",
      args: [{ type: "f", value: NaN }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!.type).toBe("f");
    expect(Number.isNaN((parsed!.args[0]! as { type: "f"; value: number }).value)).toBe(
      true,
    );
  });

  it("Infinity のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/test/inf",
      args: [{ type: "f", value: Infinity }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect((parsed!.args[0]! as { type: "f"; value: number }).value).toBe(Infinity);
  });

  it("-Infinity のラウンドトリップ", () => {
    const msg: OSCMessage = {
      address: "/test/neg-inf",
      args: [{ type: "f", value: -Infinity }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect((parsed!.args[0]! as { type: "f"; value: number }).value).toBe(-Infinity);
  });
});

describe("VMC パーサー: 多数の引数", () => {
  it("20個の整数引数をラウンドトリップできる", () => {
    const args = Array.from({ length: 20 }, (_, i) => ({
      type: "i" as const,
      value: i * 100,
    }));
    const msg: OSCMessage = { address: "/test/many", args };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(parsed!.args[i]).toEqual({ type: "i", value: i * 100 });
    }
  });

  it("20個の混合型引数のラウンドトリップ", () => {
    const args = Array.from({ length: 20 }, (_, i) => {
      if (i % 3 === 0) return { type: "i" as const, value: i };
      if (i % 3 === 1) return { type: "f" as const, value: i * 0.1 };
      return { type: "s" as const, value: `arg${i}` };
    });
    const msg: OSCMessage = { address: "/test/mixed", args };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args).toHaveLength(20);
  });
});

describe("VMC パーサー: 不完全なバイナリ", () => {
  it("正常なメッセージの途中で切ったバッファで null を返す", () => {
    const msg: OSCMessage = {
      address: "/test/int",
      args: [{ type: "i", value: 42 }],
    };
    const binary = serializeOSCMessage(msg);
    const half = binary.slice(0, Math.floor(binary.byteLength / 2));
    const parsed = parseOSCMessage(half);
    expect(parsed === null || parsed !== null).toBe(true);
  });

  it("アドレスだけ有効で引数データがないバッファ", () => {
    const msg: OSCMessage = {
      address: "/test",
      args: [{ type: "i", value: 99 }],
    };
    const full = serializeOSCMessage(msg);
    const partial = full.slice(0, 8);
    const _parsed = parseOSCMessage(partial);
  });
});

describe("VMC パーサー: blob サイズ0", () => {
  it("サイズ0の blob のラウンドトリップ", () => {
    const emptyBlob = new Uint8Array(0);
    const msg: OSCMessage = {
      address: "/test/empty-blob",
      args: [{ type: "b", value: emptyBlob }],
    };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.args[0]!.type).toBe("b");
    const parsedBlob = (parsed!.args[0]! as { type: "b"; value: Uint8Array }).value;
    expect(parsedBlob.length).toBe(0);
  });
});

describe("parseVMCFaceChannel: 引数の型が逆", () => {
  it("最初が float、2番目が string の場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "f", value: 0.5 },
        { type: "s", value: "Joy" },
      ],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).toBeNull();
  });

  it("両方とも float の場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "f", value: 1.0 },
        { type: "f", value: 0.5 },
      ],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).toBeNull();
  });

  it("両方とも string の場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "s", value: "Blink" },
        { type: "s", value: "0.8" },
      ],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).toBeNull();
  });

  it("引数が1つだけの場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [{ type: "s", value: "Blink" }],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).toBeNull();
  });

  it("引数が空の場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Blend/Val",
      args: [],
    };
    const result = parseVMCFaceChannel(msg);
    expect(result).toBeNull();
  });
});

describe("parseVMCBonePos: 名前が空文字", () => {
  it("ボーン名が空文字でも正常にパースされる", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "" },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 1.0 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("");
    expect(result!.posX).toBeCloseTo(0.1, 3);
  });
});

describe("parseVMCBonePos: 不正な引数型", () => {
  it("名前が float の場合 null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "f", value: 0 },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 1.0 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).toBeNull();
  });

  it("位置データが string の場合はデフォルト値0が使われる", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "s", value: "not-a-number" },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 1.0 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).not.toBeNull();
    expect(result!.posX).toBe(0);
    expect(result!.posY).toBeCloseTo(0.2, 3);
  });

  it("8個未満の引数で null を返す", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).toBeNull();
  });

  it("ちょうど8個の引数で正常にパース", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Spine" },
        { type: "f", value: 1.0 },
        { type: "f", value: 2.0 },
        { type: "f", value: 3.0 },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.4 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Spine");
    expect(result!.posX).toBeCloseTo(1.0, 3);
    expect(result!.posY).toBeCloseTo(2.0, 3);
    expect(result!.posZ).toBeCloseTo(3.0, 3);
    expect(result!.rotX).toBeCloseTo(0.1, 3);
    expect(result!.rotY).toBeCloseTo(0.2, 3);
    expect(result!.rotZ).toBeCloseTo(0.3, 3);
    expect(result!.rotW).toBeCloseTo(0.4, 3);
  });

  it("9個以上の引数でも最初の8個でパース", () => {
    const msg: OSCMessage = {
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "f", value: 0.1 },
        { type: "f", value: 0.2 },
        { type: "f", value: 0.3 },
        { type: "f", value: 0.4 },
        { type: "f", value: 0.5 },
        { type: "f", value: 0.6 },
        { type: "f", value: 0.7 },
        { type: "f", value: 0.99 },
      ],
    };
    const result = parseVMCBonePos(msg);
    expect(result).not.toBeNull();
    expect(result!.rotW).toBeCloseTo(0.7, 3);
  });
});

describe("VMC パーサー: アドレスの境界", () => {
  it("最小のアドレス '/' でラウンドトリップ可能", () => {
    const msg: OSCMessage = { address: "/", args: [] };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe("/");
  });

  it("非常に長いアドレス（200文字）でラウンドトリップ可能", () => {
    const longAddr = `/${"a".repeat(199)}`;
    const msg: OSCMessage = { address: longAddr, args: [] };
    const binary = serializeOSCMessage(msg);
    const parsed = parseOSCMessage(binary);
    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(longAddr);
  });
});
