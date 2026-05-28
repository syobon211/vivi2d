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
    const src = new Uint16Array([0x1234, 0xabcd, 0xffff, 0xff00]);
    const dst = normalizeToRgba8(src);
    expect(Array.from(dst)).toEqual([0x12, 0xab, 0xff, 0xff]);
  });

  it("Float32Array は 0..1 範囲で gamma 2.2 補正 + alpha は線形 *255", () => {
    const src = new Float32Array([0.0, 1.0, 0.5, 1.0]);
    const dst = normalizeToRgba8(src);
    expect(dst[0]).toBe(0);
    expect(dst[1]).toBe(255);
    expect(dst[2]).toBe(Math.round(0.5 ** (1 / 2.2) * 255));
    expect(dst[3]).toBe(255);
  });

  it("Float32Array: alpha の線形 *255 が RGB と独立である", () => {
    const src = new Float32Array([0.0, 0.0, 0.0, 0.5]);
    const dst = normalizeToRgba8(src);
    expect(dst[0]).toBe(0);
    expect(dst[1]).toBe(0);
    expect(dst[2]).toBe(0);
    expect(dst[3]).toBe(Math.round(0.5 * 255));
  });

  it("空配列でも例外を投げない", () => {
    expect(() => normalizeToRgba8(new Uint16Array(0))).not.toThrow();
    expect(() => normalizeToRgba8(new Float32Array(0))).not.toThrow();
    expect(normalizeToRgba8(new Uint16Array(0)).length).toBe(0);
  });

  it("長さを保ったまま変換する（width*height*4 想定）", () => {
    const pixels = 32;
    const src = new Uint16Array(pixels * 4);
    const dst = normalizeToRgba8(src);
    expect(dst.length).toBe(pixels * 4);
  });

  it("ag-psd helpers.imageDataToCanvas と同じ値を返す（Uint16 / Float32 混合）", () => {
    const u16 = new Uint16Array([
      0x0000, 0x00ff, 0x0100, 0xffff, 0x1234, 0xabcd, 0x5555, 0x7fff, 0x0001, 0x00aa,
      0xff00, 0x8000, 0xf000, 0x0f00, 0x00f0, 0x000f,
    ]);
    const u16Expected = new Uint8ClampedArray(u16.length);
    for (let i = 0; i < u16.length; i++) u16Expected[i] = u16[i]! >>> 8;
    const u16Dst = normalizeToRgba8(u16);
    expect(Array.from(u16Dst)).toEqual(Array.from(u16Expected));

    const f32 = new Float32Array([0.25, 0.5, 0.75, 1.0, 0.0, 1.0, 0.333, 0.5]);
    const f32Expected = new Uint8ClampedArray(f32.length);
    for (let i = 0; i < f32.length; i += 4) {
      f32Expected[i + 0] = Math.round(f32[i + 0]! ** (1 / 2.2) * 255);
      f32Expected[i + 1] = Math.round(f32[i + 1]! ** (1 / 2.2) * 255);
      f32Expected[i + 2] = Math.round(f32[i + 2]! ** (1 / 2.2) * 255);
      f32Expected[i + 3] = Math.round(f32[i + 3]! * 255);
    }
    const f32Dst = normalizeToRgba8(f32);
    expect(Array.from(f32Dst)).toEqual(Array.from(f32Expected));
  });
});
