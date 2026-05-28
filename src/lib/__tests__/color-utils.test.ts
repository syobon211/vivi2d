import {
  getDrawOrder,
  getMultiplyColor,
  getScreenColor,
  hexStringToRgb,
  hexToRgbColor,
  isScreenColorDefault,
  lerpColor,
  rgbColorToHex,
  rgbToHexString,
} from "@vivi2d/core/color-utils";
import { describe, expect, it } from "vitest";

describe("rgbColorToHex", () => {
  it("白（1,1,1）→ 0xFFFFFF", () => {
    expect(rgbColorToHex({ r: 1, g: 1, b: 1 })).toBe(0xffffff);
  });

  it("黒（0,0,0）→ 0x000000", () => {
    expect(rgbColorToHex({ r: 0, g: 0, b: 0 })).toBe(0x000000);
  });

  it("赤（1,0,0）→ 0xFF0000", () => {
    expect(rgbColorToHex({ r: 1, g: 0, b: 0 })).toBe(0xff0000);
  });

  it("緑（0,1,0）→ 0x00FF00", () => {
    expect(rgbColorToHex({ r: 0, g: 1, b: 0 })).toBe(0x00ff00);
  });

  it("青（0,0,1）→ 0x0000FF", () => {
    expect(rgbColorToHex({ r: 0, g: 0, b: 1 })).toBe(0x0000ff);
  });

  it("中間値（0.5, 0.5, 0.5）→ 0x808080", () => {
    expect(rgbColorToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe(0x808080);
  });

  it("範囲外の値はクランプされる", () => {
    expect(rgbColorToHex({ r: 1.5, g: -0.5, b: 2 })).toBe(0xff00ff);
  });
});

describe("hexToRgbColor", () => {
  it("0xFFFFFF → 白（1,1,1）", () => {
    const c = hexToRgbColor(0xffffff);
    expect(c.r).toBe(1);
    expect(c.g).toBe(1);
    expect(c.b).toBe(1);
  });

  it("0x000000 → 黒（0,0,0）", () => {
    const c = hexToRgbColor(0x000000);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it("0xFF0000 → 赤（1,0,0）", () => {
    const c = hexToRgbColor(0xff0000);
    expect(c.r).toBe(1);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });
});

describe("lerpColor", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 1, g: 1, b: 1 };

  it("t=0 は a を返す", () => {
    const result = lerpColor(black, white, 0);
    expect(result).toEqual(black);
  });

  it("t=1 は b を返す", () => {
    const result = lerpColor(black, white, 1);
    expect(result).toEqual(white);
  });

  it("t=0.5 は中間値を返す", () => {
    const result = lerpColor(black, white, 0.5);
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.5);
    expect(result.b).toBe(0.5);
  });

  it("異なるチャンネルごとに補間される", () => {
    const a = { r: 0.2, g: 0.4, b: 0.6 };
    const b = { r: 0.8, g: 0.6, b: 0.4 };
    const result = lerpColor(a, b, 0.5);
    expect(result.r).toBe(0.5);
    expect(result.g).toBe(0.5);
    expect(result.b).toBe(0.5);
  });
});

describe("isScreenColorDefault", () => {
  it("undefined → true", () => {
    expect(isScreenColorDefault(undefined)).toBe(true);
  });

  it("{0,0,0} → true", () => {
    expect(isScreenColorDefault({ r: 0, g: 0, b: 0 })).toBe(true);
  });

  it("非黒 → false", () => {
    expect(isScreenColorDefault({ r: 0.1, g: 0, b: 0 })).toBe(false);
    expect(isScreenColorDefault({ r: 0, g: 0.1, b: 0 })).toBe(false);
    expect(isScreenColorDefault({ r: 0, g: 0, b: 0.1 })).toBe(false);
  });
});

describe("getDrawOrder", () => {
  it("undefined → 500（デフォルト）", () => {
    expect(getDrawOrder(undefined)).toBe(500);
  });

  it("指定値をそのまま返す", () => {
    expect(getDrawOrder(0)).toBe(0);
    expect(getDrawOrder(1000)).toBe(1000);
    expect(getDrawOrder(250)).toBe(250);
  });
});

describe("getMultiplyColor", () => {
  it("undefined → 白（デフォルト）", () => {
    const c = getMultiplyColor(undefined);
    expect(c.r).toBe(1);
    expect(c.g).toBe(1);
    expect(c.b).toBe(1);
  });

  it("指定値をそのまま返す", () => {
    const color = { r: 0.5, g: 0.3, b: 0.7 };
    expect(getMultiplyColor(color)).toBe(color);
  });
});


describe("rgbColorToHex ↔ hexToRgbColor ラウンドトリップ", () => {
  it.each([
    [0xff0000, "赤"],
    [0x00ff00, "緑"],
    [0x0000ff, "青"],
    [0xffffff, "白"],
    [0x000000, "黒"],
    [0x808080, "グレー"],
    [0x123456, "任意色"],
    [0xabcdef, "薄い色"],
  ])("hex → RGBColor → hex で値が保持される (0x%s %s)", (hex) => {
    const color = hexToRgbColor(hex);
    const backToHex = rgbColorToHex(color);
    expect(backToHex).toBe(hex);
  });

  it("小数精度: 127/255 の値がラウンドトリップで保持される", () => {
    const original = hexToRgbColor(0x7f7f7f);
    const hex = rgbColorToHex(original);
    expect(hex).toBe(0x7f7f7f);
  });
});

describe("rgbColorToHex — 境界値・特殊値", () => {
  it("各チャンネル最小精度 (1/255) が正しく変換される", () => {
    const color = { r: 1 / 255, g: 1 / 255, b: 1 / 255 };
    expect(rgbColorToHex(color)).toBe(0x010101);
  });

  it("254/255 ≈ 0.996 が FF ではなく FE に変換される", () => {
    const color = { r: 254 / 255, g: 254 / 255, b: 254 / 255 };
    expect(rgbColorToHex(color)).toBe(0xfefefe);
  });

  it("負のクランプ: 各チャンネル -1 → 0", () => {
    expect(rgbColorToHex({ r: -1, g: -1, b: -1 })).toBe(0x000000);
  });

  it("上限クランプ: 各チャンネル 2 → 255", () => {
    expect(rgbColorToHex({ r: 2, g: 2, b: 2 })).toBe(0xffffff);
  });
});

describe("lerpColor — エッジケース", () => {
  it("同一色の補間は t に関わらず同じ色", () => {
    const color = { r: 0.3, g: 0.6, b: 0.9 };
    expect(lerpColor(color, color, 0)).toEqual(color);
    expect(lerpColor(color, color, 0.5)).toEqual(color);
    expect(lerpColor(color, color, 1)).toEqual(color);
  });

  it("t < 0（外挿）で範囲外に逸脱する", () => {
    const a = { r: 0.5, g: 0.5, b: 0.5 };
    const b = { r: 1, g: 1, b: 1 };
    const result = lerpColor(a, b, -1);
    // r = 0.5 + (1-0.5)*(-1) = 0.5 - 0.5 = 0
    expect(result.r).toBeCloseTo(0);
  });

  it("t > 1（外挿）で範囲外に逸脱する", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 0.5, g: 0.5, b: 0.5 };
    const result = lerpColor(a, b, 2);
    // r = 0 + 0.5*2 = 1.0
    expect(result.r).toBeCloseTo(1.0);
  });

  it("t=0.333 で正確に 1/3 の位置を返す", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 1, g: 1, b: 1 };
    const result = lerpColor(a, b, 1 / 3);
    expect(result.r).toBeCloseTo(1 / 3, 10);
    expect(result.g).toBeCloseTo(1 / 3, 10);
    expect(result.b).toBeCloseTo(1 / 3, 10);
  });
});

describe("isScreenColorDefault — 境界値", () => {
  it("極小値 (1e-10) は非デフォルト", () => {
    expect(isScreenColorDefault({ r: 1e-10, g: 0, b: 0 })).toBe(false);
  });

  it("{0, 0, 0} の各チャンネルが正確にゼロ", () => {
    expect(isScreenColorDefault({ r: 0, g: 0, b: 0 })).toBe(true);
  });

  it("全チャンネル非ゼロ", () => {
    expect(isScreenColorDefault({ r: 0.01, g: 0.01, b: 0.01 })).toBe(false);
  });

  it("NaN は非デフォルト", () => {
    expect(isScreenColorDefault({ r: NaN, g: 0, b: 0 })).toBe(false);
  });
});

describe("rgbColorToHex — NaN/Infinity", () => {
  it("NaN チャンネルは 0 にクランプされる", () => {
    expect(rgbColorToHex({ r: NaN, g: 0, b: 0 })).toBe(0x000000);
  });

  it("Infinity チャンネルは 255 にクランプされる", () => {
    expect(rgbColorToHex({ r: Infinity, g: 0, b: 0 })).toBe(0xff0000);
  });

  it("-Infinity チャンネルは 0 にクランプされる", () => {
    expect(rgbColorToHex({ r: -Infinity, g: 0, b: 0 })).toBe(0x000000);
  });
});

describe("getScreenColor", () => {
  it("undefined → 黒（デフォルト）", () => {
    const c = getScreenColor(undefined);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it("指定値をそのまま返す", () => {
    const color = { r: 0.2, g: 0.4, b: 0.6 };
    expect(getScreenColor(color)).toBe(color);
  });
});

describe("rgbToHexString", () => {
  it("白 → '#ffffff'", () => {
    expect(rgbToHexString({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
  });

  it("黒 → '#000000'", () => {
    expect(rgbToHexString({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("赤 → '#ff0000'", () => {
    expect(rgbToHexString({ r: 1, g: 0, b: 0 })).toBe("#ff0000");
  });

  it("中間値 → '#808080'", () => {
    expect(rgbToHexString({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });
});

describe("hexStringToRgb", () => {
  it("'#ffffff' → 白", () => {
    const c = hexStringToRgb("#ffffff");
    expect(c.r).toBe(1);
    expect(c.g).toBe(1);
    expect(c.b).toBe(1);
  });

  it("'#000000' → 黒", () => {
    const c = hexStringToRgb("#000000");
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it("'#ff0000' → 赤", () => {
    const c = hexStringToRgb("#ff0000");
    expect(c.r).toBe(1);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it("rgbToHexString → hexStringToRgb のラウンドトリップ", () => {
    const original = { r: 0.5, g: 0.3, b: 0.8 };
    const hex = rgbToHexString(original);
    const back = hexStringToRgb(hex);
    expect(back.r).toBeCloseTo(original.r, 2);
    expect(back.g).toBeCloseTo(original.g, 2);
    expect(back.b).toBeCloseTo(original.b, 2);
  });
});

describe("getDrawOrder — 境界値", () => {
  it("drawOrder = 0 は有効値として返す（undefined と区別）", () => {
    expect(getDrawOrder(0)).toBe(0);
  });

  it("drawOrder = 1000（最大値）をそのまま返す", () => {
    expect(getDrawOrder(1000)).toBe(1000);
  });

  it("小数値もそのまま返す（クランプはストア側の責務）", () => {
    expect(getDrawOrder(333.333)).toBe(333.333);
  });
});
