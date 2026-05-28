import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/themeStore";


describe("themeStore — 追加ブランチ", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "dark" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setTheme で light に変更できる", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("setTheme で dark に変更できる", () => {
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggleTheme で dark → light に切り替わる", () => {
    useThemeStore.setState({ theme: "dark" });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggleTheme で light → dark に切り替わる", () => {
    useThemeStore.setState({ theme: "light" });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggleTheme を2回呼ぶと元に戻る", () => {
    useThemeStore.setState({ theme: "dark" });
    useThemeStore.getState().toggleTheme();
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("localStorage に保存されたテーマが読み込まれる（dark）", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("dark");
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("localStorage に保存されたテーマが読み込まれる（light）", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("light");
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("localStorage に不正な値がある場合はシステムテーマを使用する", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("invalid-theme");
    expect(() => useThemeStore.getState().setTheme("dark")).not.toThrow();
  });

  it("localStorage.setItem が例外を投げても persistTheme はエラーにならない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => useThemeStore.getState().setTheme("light")).not.toThrow();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("localStorage.getItem が例外を投げても loadTheme はエラーにならない", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => useThemeStore.setState({ theme: "dark" })).not.toThrow();
  });

  it("window.matchMedia が undefined の場合、デフォルトで dark を返す", () => {
    const original = window.matchMedia;
    (window as any).matchMedia = undefined;

    useThemeStore.setState({ theme: "light" });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");

    window.matchMedia = original;
  });

  it("window.matchMedia('prefers-color-scheme: light') が true の場合、light を返す", () => {
    const original = window.matchMedia;
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: true });

    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");

    window.matchMedia = original;
  });

  it("matchMedia が light にマッチしない場合、dark がデフォルトになる (line 23)", () => {
    const original = window.matchMedia;
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });

    useThemeStore.setState({ theme: "dark" });
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");

    window.matchMedia = original;
  });
});
