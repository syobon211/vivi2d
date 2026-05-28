import { afterEach, describe, expect, it, vi } from "vitest";
import { setWarnHandler, toThreeBlendConfig } from "../blend-modes";


vi.mock("three", () => ({
  NormalBlending: 1,
  CustomBlending: 5,
  AddEquation: 100,
  SrcAlphaFactor: 204,
  OneMinusSrcAlphaFactor: 205,
  OneFactor: 201,
  OneMinusSrcColorFactor: 203,
  DstColorFactor: 208,
  ZeroFactor: 200,
}));

describe("toThreeBlendConfig", () => {
  it("normal → NormalBlending", () => {
    const config = toThreeBlendConfig("normal");
    expect(config.blending).toBe(1); // NormalBlending
    expect(config.blendSrc).toBe(204); // SrcAlphaFactor
    expect(config.blendDst).toBe(205); // OneMinusSrcAlphaFactor
    expect(config.blendEquation).toBe(100); // AddEquation
  });

  it("add → CustomBlending (SrcAlpha + One)", () => {
    const config = toThreeBlendConfig("add");
    expect(config.blending).toBe(5); // CustomBlending
    expect(config.blendSrc).toBe(204); // SrcAlphaFactor
    expect(config.blendDst).toBe(201); // OneFactor
  });

  it("multiply → CustomBlending (DstColor + Zero)", () => {
    const config = toThreeBlendConfig("multiply");
    expect(config.blending).toBe(5);
    expect(config.blendSrc).toBe(208); // DstColorFactor
    expect(config.blendDst).toBe(200); // ZeroFactor
  });

  it("screen → CustomBlending (One + OneMinusSrcColor)", () => {
    const config = toThreeBlendConfig("screen");
    expect(config.blending).toBe(5);
    expect(config.blendSrc).toBe(201); // OneFactor
    expect(config.blendDst).toBe(203); // OneMinusSrcColorFactor
  });

  it("未対応モード → NormalBlending + console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = toThreeBlendConfig("overlay");

    expect(config.blending).toBe(1); // NormalBlending
    expect(config.blendSrc).toBe(204); // SrcAlphaFactor
    expect(config.blendDst).toBe(205); // OneMinusSrcAlphaFactor
    expect(config.blendEquation).toBe(100); // AddEquation
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("overlay"));

    warnSpy.mockRestore();
  });

  it("同じ未対応モードの警告は1回だけ出る", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    toThreeBlendConfig("color-dodge");
    toThreeBlendConfig("color-dodge");

    const calls = warnSpy.mock.calls.filter((c) => String(c[0]).includes("color-dodge"));
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

      toThreeBlendConfig("exclusion");

      expect(handler).toHaveBeenCalledWith(expect.stringContaining("exclusion"));
    });

    it("null 指定でデフォルト（console.warn）に戻る", () => {
      const handler = vi.fn();
      setWarnHandler(handler);
      setWarnHandler(null);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      toThreeBlendConfig("darken");

      expect(handler).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("darken"));

      warnSpy.mockRestore();
    });
  });
});
