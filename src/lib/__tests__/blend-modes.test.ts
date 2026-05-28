import { describe, expect, it } from "vitest";
import {
  BLEND_MODE_GROUPS,
  BLEND_MODES_ALL,
  isValidBlendMode,
  toPixiBlendMode,
} from "@/lib/blend-modes";

describe("toPixiBlendMode", () => {
  it.each([
    ["normal", "normal"],
    ["add", "add"],
    ["multiply", "multiply"],
    ["screen", "screen"],
    ["overlay", "overlay"],
    ["darken", "darken"],
    ["lighten", "lighten"],
    ["color dodge", "color-dodge"],
    ["color burn", "color-burn"],
    ["hard light", "hard-light"],
    ["soft light", "soft-light"],
    ["difference", "difference"],
    ["exclusion", "exclusion"],
  ] as const)("PSD '%s' → PixiJS '%s'", (psd, expected) => {
    expect(toPixiBlendMode(psd)).toBe(expected);
  });

  it("未知のブレンドモードに対して 'normal' を返す", () => {
    expect(toPixiBlendMode("dissolve")).toBe("normal");
    expect(toPixiBlendMode("vivid light")).toBe("normal");
    expect(toPixiBlendMode("")).toBe("normal");
  });

  it("大文字小文字を区別する（PSD仕様通り小文字のみ対応）", () => {
    expect(toPixiBlendMode("Multiply")).toBe("normal");
    expect(toPixiBlendMode("SCREEN")).toBe("normal");
  });
});

describe("BLEND_MODES_ALL", () => {
  it("13種のブレンドモードを含む", () => {
    expect(BLEND_MODES_ALL).toHaveLength(13);
    expect(BLEND_MODES_ALL).toContain("normal");
    expect(BLEND_MODES_ALL).toContain("add");
    expect(BLEND_MODES_ALL).toContain("multiply");
    expect(BLEND_MODES_ALL).toContain("screen");
    expect(BLEND_MODES_ALL).toContain("overlay");
    expect(BLEND_MODES_ALL).toContain("color-dodge");
    expect(BLEND_MODES_ALL).toContain("exclusion");
  });
});

describe("BLEND_MODE_GROUPS", () => {
  it("全グループのモードを合算すると13種になる", () => {
    const allModes = BLEND_MODE_GROUPS.flatMap((g) => g.modes);
    expect(allModes).toHaveLength(13);
  });

  it("各グループにラベルが設定されている", () => {
    for (const group of BLEND_MODE_GROUPS) {
      expect(group.label).toMatch(/\S/);
      expect(group.modes.length).toBeGreaterThan(0);
    }
  });

  it("全グループのモードがBLEND_MODES_ALLに含まれる", () => {
    const allModes = BLEND_MODE_GROUPS.flatMap((g) => g.modes);
    for (const mode of allModes) {
      expect(BLEND_MODES_ALL).toContain(mode);
    }
  });
});

describe("isValidBlendMode", () => {
  it("有効なブレンドモードに対して true を返す", () => {
    expect(isValidBlendMode("normal")).toBe(true);
    expect(isValidBlendMode("screen")).toBe(true);
    expect(isValidBlendMode("color-dodge")).toBe(true);
  });

  it("無効なブレンドモードに対して false を返す", () => {
    expect(isValidBlendMode("dissolve")).toBe(false);
    expect(isValidBlendMode("")).toBe(false);
    expect(isValidBlendMode("NORMAL")).toBe(false);
  });
});
