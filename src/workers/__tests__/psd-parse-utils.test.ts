import { describe, expect, it } from "vitest";
import { normalizeToRgba8 } from "../psd-parse-utils";

// ============================================================
// normalizeToRgba8
// ============================================================

describe("normalizeToRgba8", () => {
  it("Uint8ClampedArray はそのまま返す（コピーしない）", () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255]);
    const dst = normalizeToRgba8(src);
    expect(dst).toBe(src);
  });

  it("Uint8Array は同じ値を持つ Uint8ClampedArray にコピーする", () => {
    const src = new Uint8Array([10, 20, 30, 255]);
    const dst = normalizeToRgba8(src);
    expect(dst).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(dst)).toEqual([10, 20, 30, 255]);
  });

  it("Uint16Array は上位 8bit を取り出す (>>> 8)", () => {
    // 0x1234 = 4660, >>> 8 = 0x12 = 18
    // 0xabcd = 43981, >>> 8 = 0xab = 171
    // 0xffff = 65535, >>> 8 = 0xff = 255
    const src = new Uint16Array([
      0x1234, 0xabcd, 0xffff, 0xff00, 0x00ff, 0x0100, 0x5555, 0x7fff,
    ]);
    const dst = normalizeToRgba8(src);
    expect(Array.from(dst)).toEqual([18, 171, 255, 255, 0, 1, 85, 127]);
  });

  it("Float32Array は 0..1 範囲で gamma 2.2 補正 + alpha は線形 *255", () => {
    const src = new Float32Array([0.0, 1.0, 0.5, 1.0, 0.25, 0.75, 0, 0.5]);
    const dst = normalizeToRgba8(src);
    expect(Array.from(dst)).toEqual([0, 255, 186, 255, 136, 224, 0, 128]);
  });

  it("空配列でも例外を投げない", () => {
    expect(() => normalizeToRgba8(new Uint16Array(0))).not.toThrow();
    expect(() => normalizeToRgba8(new Float32Array(0))).not.toThrow();
    expect(normalizeToRgba8(new Uint16Array(0)).length).toBe(0);
  });
});
