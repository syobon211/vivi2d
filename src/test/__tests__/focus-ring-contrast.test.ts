import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";


const GLOBAL_CSS_PATH = resolve(__dirname, "..", "..", "styles", "global.css");
const GLOBAL_CSS = readFileSync(GLOBAL_CSS_PATH, "utf-8");

type RGB = { r: number; g: number; b: number };

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) {
    throw new Error(`unsupported hex form: #${h}`);
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function extractBlockVars(selectorPattern: RegExp, varName: string): string | null {
  const block = GLOBAL_CSS.match(selectorPattern);
  if (!block) return null;
  const varRegex = new RegExp(`${varName}\\s*:\\s*([^;]+);`);
  const match = block[0].match(varRegex);
  const captured = match?.[1];
  return captured !== undefined ? captured.trim() : null;
}

const DARK_BLOCK = /\[data-theme="dark"\][^{]*\{[\s\S]*?\n\s{2}\}/;
const LIGHT_BLOCK = /\[data-theme="light"\][^{]*\{[\s\S]*?\n\s{2}\}/;

describe("focus ring contrast (P8-4)", () => {
  it("dark テーマの --focus-ring-color は --bg-base に対して 3:1 以上", () => {
    const ringHex = extractBlockVars(DARK_BLOCK, "--focus-ring-color");
    const bgHex = extractBlockVars(DARK_BLOCK, "--bg-base");
    expect(ringHex, "dark: --focus-ring-color missing").not.toBeNull();
    expect(bgHex, "dark: --bg-base missing").not.toBeNull();
    const ratio = contrastRatio(parseHex(ringHex as string), parseHex(bgHex as string));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("light テーマの --focus-ring-color は --bg-base に対して 3:1 以上", () => {
    const ringHex = extractBlockVars(LIGHT_BLOCK, "--focus-ring-color");
    const bgHex = extractBlockVars(LIGHT_BLOCK, "--bg-base");
    expect(ringHex, "light: --focus-ring-color missing").not.toBeNull();
    expect(bgHex, "light: --bg-base missing").not.toBeNull();
    const ratio = contrastRatio(parseHex(ringHex as string), parseHex(bgHex as string));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("--focus-ring-width は 3px 以上", () => {
    const widthMatch = GLOBAL_CSS.match(/--focus-ring-width\s*:\s*(\d+)px;/);
    expect(widthMatch, "--focus-ring-width missing").not.toBeNull();
    const captured = widthMatch?.[1];
    expect(captured, "--focus-ring-width capture missing").toBeDefined();
    const px = Number.parseInt(captured as string, 10);
    expect(px).toBeGreaterThanOrEqual(3);
  });
});
