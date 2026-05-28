import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleToggle } from "../hooks/useLocaleToggle";

const STORAGE_KEY = "vivi-viewer-locale";

describe("useLocaleToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    document.documentElement.lang = "";
    vi.restoreAllMocks();
  });

  it("restores a persisted Japanese locale", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result } = renderHook(() => useLocaleToggle());
    expect(result.current.locale).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("normalizes a persisted Simplified Chinese locale", () => {
    localStorage.setItem(STORAGE_KEY, "ZH_hans_CN");
    const { result } = renderHook(() => useLocaleToggle());
    expect(result.current.locale).toBe("zh-Hans");
  });

  it("falls back to English when no persisted locale exists", () => {
    const { result } = renderHook(() => useLocaleToggle());
    expect(result.current.locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("rejects Traditional Chinese as unsupported instead of mapping it to Simplified Chinese", () => {
    localStorage.setItem(STORAGE_KEY, "zh-TW");
    const { result } = renderHook(() => useLocaleToggle());
    expect(result.current.locale).toBe("en");
  });

  it("returns translated strings for the active locale", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result } = renderHook(() => useLocaleToggle());
    expect(result.current.t("openModel")).toBe("モデルを開く");
    expect(result.current.t("dropPrompt")).toBe(".viviファイルをドロップ");
  });

  it("cycles through all supported locales in a deterministic order", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const { result } = renderHook(() => useLocaleToggle());

    act(() => result.current.cycleLocale());
    expect(result.current.locale).toBe("ja");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ja");

    act(() => result.current.cycleLocale());
    expect(result.current.locale).toBe("zh-Hans");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("zh-Hans");

    act(() => result.current.cycleLocale());
    expect(result.current.locale).toBe("ko-KR");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ko-KR");

    act(() => result.current.cycleLocale());
    expect(result.current.locale).toBe("en");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("persists explicit locale selection", () => {
    const { result } = renderHook(() => useLocaleToggle());
    act(() => result.current.setLocale("ko-KR"));
    expect(result.current.locale).toBe("ko-KR");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ko-KR");
    expect(document.documentElement.lang).toBe("ko-KR");
  });

  it("keeps the translator function stable when the locale does not change", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result, rerender } = renderHook(() => useLocaleToggle());
    const firstT = result.current.t;
    rerender();
    expect(result.current.t).toBe(firstT);
  });

  it("updates the translator function when the locale changes", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result } = renderHook(() => useLocaleToggle());
    const firstT = result.current.t;
    act(() => result.current.setLocale("en"));
    expect(result.current.t).not.toBe(firstT);
  });

  it("keeps the cycle function stable within the same locale", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result, rerender } = renderHook(() => useLocaleToggle());
    const firstCycle = result.current.cycleLocale;
    rerender();
    expect(result.current.cycleLocale).toBe(firstCycle);
  });

  it("does not crash when localStorage throws while saving", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const { result } = renderHook(() => useLocaleToggle());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => {
      act(() => result.current.setLocale("en"));
    }).not.toThrow();
    expect(result.current.locale).toBe("en");
  });

  it("reads persisted storage only during lazy initialization", () => {
    localStorage.setItem(STORAGE_KEY, "ja");
    const getItemSpy = vi.spyOn(localStorage, "getItem");
    const { rerender } = renderHook(() => useLocaleToggle());
    const initialCallCount = getItemSpy.mock.calls.filter(
      (call) => call[0] === STORAGE_KEY,
    ).length;
    expect(initialCallCount).toBe(1);
    rerender();
    rerender();
    const afterRerenderCallCount = getItemSpy.mock.calls.filter(
      (call) => call[0] === STORAGE_KEY,
    ).length;
    expect(afterRerenderCallCount).toBe(initialCallCount);
  });
});
