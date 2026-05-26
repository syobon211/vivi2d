import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASER_BLEND, setWarnHandler, toPhaserBlendMode } from "../blend-modes";


describe("toPhaserBlendMode", () => {
  it("normal → NORMAL (0)", () => {
    expect(toPhaserBlendMode("normal")).toBe(PHASER_BLEND.NORMAL);
  });

  it("add → ADD (1)", () => {
    expect(toPhaserBlendMode("add")).toBe(PHASER_BLEND.ADD);
  });

  it("multiply → MULTIPLY (2)", () => {
    expect(toPhaserBlendMode("multiply")).toBe(PHASER_BLEND.MULTIPLY);
  });

  it("screen → SCREEN (3)", () => {
    expect(toPhaserBlendMode("screen")).toBe(PHASER_BLEND.SCREEN);
  });

  it("未対応モード → NORMAL + console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = toPhaserBlendMode("overlay");

    expect(result).toBe(PHASER_BLEND.NORMAL);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("overlay"));

    warnSpy.mockRestore();
  });

  it("同じ未対応モードの警告は1回だけ出る", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    toPhaserBlendMode("hard-light");
    toPhaserBlendMode("hard-light");

    const calls = warnSpy.mock.calls.filter((c) => String(c[0]).includes("hard-light"));
    expect(calls.length).toBe(1);

    warnSpy.mockRestore();
  });

  describe("setWarnHandler", () => {
    afterEach(() => {
      setWarnHandler(null);
    });

    it("カスタムハンドラが未対応モードで呼ばれる", () => {
      const handler = vi.fn();
      setWarnHandler(handler);

      toPhaserBlendMode("exclusion");

      expect(handler).toHaveBeenCalledWith(expect.stringContaining("exclusion"));
    });

    it("null 指定でデフォルト（console.warn）に戻る", () => {
      const handler = vi.fn();
      setWarnHandler(handler);
      setWarnHandler(null);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      toPhaserBlendMode("color-burn");

      expect(handler).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("color-burn"));

      warnSpy.mockRestore();
    });
  });
});
