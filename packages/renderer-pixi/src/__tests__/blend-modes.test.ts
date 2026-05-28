import { describe, expect, it } from "vitest";
import { BLEND_MODES_ALL, isValidBlendMode, toPixiBlendMode } from "../blend-modes";

describe("toPixiBlendMode", () => {
  it.each([
    ["normal", "normal"],
    ["add", "add"],
    ["multiply", "multiply"],
    ["screen", "screen"],
    ["overlay", "overlay"],
    ["darken", "darken"],
    ["lighten", "lighten"],
    ["color-dodge", "color-dodge"],
    ["color dodge", "color-dodge"],
    ["color-burn", "color-burn"],
    ["color burn", "color-burn"],
    ["hard-light", "hard-light"],
    ["hard light", "hard-light"],
    ["soft-light", "soft-light"],
    ["soft light", "soft-light"],
    ["difference", "difference"],
    ["exclusion", "exclusion"],
  ])("maps %s to %s", (input, expected) => {
    expect(toPixiBlendMode(input)).toBe(expected);
  });

  it("falls back to normal for unknown values", () => {
    expect(toPixiBlendMode("unknown")).toBe("normal");
    expect(toPixiBlendMode("")).toBe("normal");
  });
});

describe("blend mode metadata", () => {
  it("exports the canonical vivi2d blend-mode list", () => {
    expect(BLEND_MODES_ALL).toHaveLength(13);
    expect(BLEND_MODES_ALL).toContain("normal");
    expect(BLEND_MODES_ALL).toContain("color-dodge");
    expect(BLEND_MODES_ALL).toContain("exclusion");
  });

  it("validates canonical vivi2d blend modes only", () => {
    expect(isValidBlendMode("normal")).toBe(true);
    expect(isValidBlendMode("color-dodge")).toBe(true);
    expect(isValidBlendMode("color dodge")).toBe(false);
    expect(isValidBlendMode("unknown")).toBe(false);
  });
});
