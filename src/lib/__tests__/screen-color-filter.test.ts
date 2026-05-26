import {
  createScreenColorFilter,
  updateScreenColorFilter,
} from "@vivi2d/renderer-pixi/screen-color-filter";
import { describe, expect, it } from "vitest";

// ============================================================
// GLSL: color.rgb = color.rgb + uScreenColor * color.a * (1.0 - color.rgb)
// ============================================================

function screenBlend(
  baseR: number,
  baseG: number,
  baseB: number,
  baseA: number,
  screenR: number,
  screenG: number,
  screenB: number,
): { r: number; g: number; b: number } {
  return {
    r: baseR + screenR * baseA * (1.0 - baseR),
    g: baseG + screenG * baseA * (1.0 - baseG),
    b: baseB + screenB * baseA * (1.0 - baseB),
  };
}


describe("スクリーンブレンド数式", () => {
  it("黒スクリーン色（デフォルト）は元の色を変えない", () => {
    const result = screenBlend(0.5, 0.3, 0.8, 1.0, 0, 0, 0);
    expect(result.r).toBeCloseTo(0.5);
    expect(result.g).toBeCloseTo(0.3);
    expect(result.b).toBeCloseTo(0.8);
  });

  it("白スクリーン色（完全不透明）→ 白になる", () => {
    const result = screenBlend(0.5, 0.3, 0.8, 1.0, 1, 1, 1);
    expect(result.r).toBeCloseTo(1.0);
    expect(result.g).toBeCloseTo(1.0);
    expect(result.b).toBeCloseTo(1.0);
  });

  it("白スクリーン色で base が黒の場合 → スクリーン色そのもの", () => {
    const result = screenBlend(0, 0, 0, 1.0, 1, 1, 1);
    expect(result.r).toBeCloseTo(1.0);
    expect(result.g).toBeCloseTo(1.0);
    expect(result.b).toBeCloseTo(1.0);
  });

  it("50% グレースクリーン色 → 中間的に明るくなる", () => {
    // base=0.5, screen=0.5, alpha=1
    // result = 0.5 + 0.5 * 1.0 * (1.0 - 0.5) = 0.5 + 0.25 = 0.75
    const result = screenBlend(0.5, 0.5, 0.5, 1.0, 0.5, 0.5, 0.5);
    expect(result.r).toBeCloseTo(0.75);
    expect(result.g).toBeCloseTo(0.75);
    expect(result.b).toBeCloseTo(0.75);
  });

  it("alpha=0 の場合スクリーン効果なし（プリマルチプライドアルファ）", () => {
    const result = screenBlend(0, 0, 0, 0, 1, 1, 1);
    expect(result.r).toBeCloseTo(0);
    expect(result.g).toBeCloseTo(0);
    expect(result.b).toBeCloseTo(0);
  });

  it("alpha=0.5 の場合スクリーン効果が半減する", () => {
    // base=0, screen=1, alpha=0.5
    // result = 0 + 1 * 0.5 * (1.0 - 0) = 0.5
    const result = screenBlend(0, 0, 0, 0.5, 1, 1, 1);
    expect(result.r).toBeCloseTo(0.5);
    expect(result.g).toBeCloseTo(0.5);
    expect(result.b).toBeCloseTo(0.5);
  });

  it("base が白の場合はスクリーン色に関係なく白のまま", () => {
    const result = screenBlend(1, 1, 1, 1.0, 0.8, 0.5, 0.3);
    expect(result.r).toBeCloseTo(1.0);
    expect(result.g).toBeCloseTo(1.0);
    expect(result.b).toBeCloseTo(1.0);
  });

  it("チャンネルごとに独立して計算される", () => {
    const result = screenBlend(0.2, 0.0, 1.0, 1.0, 0.8, 0.5, 1.0);
    expect(result.r).toBeCloseTo(0.84);
    expect(result.g).toBeCloseTo(0.5);
    expect(result.b).toBeCloseTo(1.0);
  });

  it("スクリーンブレンドは可換ではない（base と screen を交換すると違う結果）", () => {
    const normal = screenBlend(0.3, 0.3, 0.3, 1.0, 0.7, 0.7, 0.7);
    const swapped = screenBlend(0.7, 0.7, 0.7, 1.0, 0.3, 0.3, 0.3);
    // = screen + base*(1-screen) = screen + base - base*screen
    expect(normal.r).toBeCloseTo(swapped.r);
  });
});


describe("createScreenColorFilter", () => {
  it("Filter インスタンスを返す", () => {
    const filter = createScreenColorFilter({ r: 0.5, g: 0.3, b: 0.8 });
    expect(filter).toBeDefined();
    expect(filter.resources).toBeDefined();
  });

  it("uniform に正しい色値が設定される", () => {
    const filter = createScreenColorFilter({ r: 0.5, g: 0.3, b: 0.8 });
    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBeCloseTo(0.5);
    expect(uniforms.uScreenColor[1]).toBeCloseTo(0.3);
    expect(uniforms.uScreenColor[2]).toBeCloseTo(0.8);
  });

  it("黒（デフォルト）でも正しく作成できる", () => {
    const filter = createScreenColorFilter({ r: 0, g: 0, b: 0 });
    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBe(0);
    expect(uniforms.uScreenColor[1]).toBe(0);
    expect(uniforms.uScreenColor[2]).toBe(0);
  });

  it("白でも正しく作成できる", () => {
    const filter = createScreenColorFilter({ r: 1, g: 1, b: 1 });
    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBe(1);
    expect(uniforms.uScreenColor[1]).toBe(1);
    expect(uniforms.uScreenColor[2]).toBe(1);
  });

  it("Float32Array で uniform 値が格納される", () => {
    const filter = createScreenColorFilter({ r: 0.1, g: 0.2, b: 0.3 });
    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor).toBeInstanceOf(Float32Array);
    expect(uniforms.uScreenColor).toHaveLength(3);
  });
});


describe("updateScreenColorFilter", () => {
  it("既存フィルターの uniform を更新する", () => {
    const filter = createScreenColorFilter({ r: 0, g: 0, b: 0 });
    updateScreenColorFilter(filter, { r: 1, g: 0.5, b: 0.25 });

    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBe(1);
    expect(uniforms.uScreenColor[1]).toBe(0.5);
    expect(uniforms.uScreenColor[2]).toBe(0.25);
  });

  it("複数回更新しても正しく反映される", () => {
    const filter = createScreenColorFilter({ r: 0, g: 0, b: 0 });

    updateScreenColorFilter(filter, { r: 0.1, g: 0.2, b: 0.3 });
    updateScreenColorFilter(filter, { r: 0.9, g: 0.8, b: 0.7 });

    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBeCloseTo(0.9, 5);
    expect(uniforms.uScreenColor[1]).toBeCloseTo(0.8, 5);
    expect(uniforms.uScreenColor[2]).toBeCloseTo(0.7, 5);
  });

  it("黒に戻す更新ができる", () => {
    const filter = createScreenColorFilter({ r: 1, g: 1, b: 1 });
    updateScreenColorFilter(filter, { r: 0, g: 0, b: 0 });

    const uniforms = filter.resources.screenColorUniforms.uniforms;
    expect(uniforms.uScreenColor[0]).toBe(0);
    expect(uniforms.uScreenColor[1]).toBe(0);
    expect(uniforms.uScreenColor[2]).toBe(0);
  });
});
