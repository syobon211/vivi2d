import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, useThemeStore } from "@/stores/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "dark" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("初期テーマが dark である", () => {
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("setTheme でテーマを変更できる", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("setTheme で localStorage に保存される", () => {
    useThemeStore.getState().setTheme("light");
    const saved = localStorage.getItem("vivi2d-theme");
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved as string);
    expect(parsed.state.theme).toBe("light");
    expect(parsed.version).toBe(1);
  });

  it("toggleTheme で dark → light に切り替わる", () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggleTheme で light → dark に切り替わる", () => {
    useThemeStore.setState({ theme: "light" });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggleTheme で localStorage に保存される", () => {
    useThemeStore.getState().toggleTheme();
    const after1 = JSON.parse(localStorage.getItem("vivi2d-theme") as string);
    expect(after1.state.theme).toBe("light");
    useThemeStore.getState().toggleTheme();
    const after2 = JSON.parse(localStorage.getItem("vivi2d-theme") as string);
    expect(after2.state.theme).toBe("dark");
  });

  it("localStorage に保存された値が不正な場合はデフォルトに戻る", () => {
    localStorage.setItem("vivi2d-theme", "invalid");
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("does not depend on system light mode for the default theme", () => {
    localStorage.clear();
    expect(DEFAULT_THEME).toBe("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("initializes to dark even when the system prefers light mode", async () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-color-scheme: light"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    localStorage.clear();
    vi.resetModules();
    vi.stubGlobal("matchMedia", matchMedia);

    const { DEFAULT_THEME: freshDefaultTheme, useThemeStore: freshThemeStore } = await import(
      "@/stores/themeStore"
    );

    expect(freshDefaultTheme).toBe("dark");
    expect(freshThemeStore.getState().theme).toBe("dark");
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
