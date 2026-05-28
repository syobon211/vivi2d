import { describe, expect, it } from "vitest";

const TOKENS = {
  dark: {
    bgBase: "#1e1e2e",
    focusRing: "#8f84f5",
  },
  light: {
    bgBase: "#f0f0f6",
    focusRing: "#6c5fd0",
  },
};

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m?.[1]) throw new Error(`invalid hex: ${hex}`);
  const body = m[1];
  const r = Number.parseInt(body.slice(0, 2), 16) / 255;
  const g = Number.parseInt(body.slice(2, 4), 16) / 255;
  const b = Number.parseInt(body.slice(4, 6), 16) / 255;
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [bright, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (bright + 0.05) / (dark + 0.05);
}

describe("WCAG 2.2 SC 1.4.11 focus-ring contrast (P8-4)", () => {
  it("dark テーマ: focus-ring が --bg-base に対して contrast ≥3:1", () => {
    const ratio = contrastRatio(TOKENS.dark.focusRing, TOKENS.dark.bgBase);
    expect(
      ratio,
      `dark theme focus ring (${TOKENS.dark.focusRing}) on bg (${TOKENS.dark.bgBase}) ratio=${ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(3.0);
  });

  it("light テーマ: focus-ring が --bg-base に対して contrast ≥3:1", () => {
    const ratio = contrastRatio(TOKENS.light.focusRing, TOKENS.light.bgBase);
    expect(
      ratio,
      `light theme focus ring (${TOKENS.light.focusRing}) on bg (${TOKENS.light.bgBase}) ratio=${ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(3.0);
  });

  it("relativeLuminance: 黒=0, 白=1 の極値を満たす", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  it("contrastRatio: 黒/白 = 21:1 の理論値に一致", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("contrastRatio: 同色は 1:1", () => {
    expect(contrastRatio("#7f7f7f", "#7f7f7f")).toBe(1);
  });

  it("relativeLuminance: 不正な hex 文字列は例外", () => {
    expect(() => relativeLuminance("rgb(0,0,0)")).toThrow(/invalid hex/);
    expect(() => relativeLuminance("#abc")).toThrow(/invalid hex/);
  });
});
