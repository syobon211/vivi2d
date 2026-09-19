import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "dark" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("setTheme の両方向を状態と永続化データへ反映する", () => {
    useThemeStore.getState().setTheme("light");
    const saved = localStorage.getItem("vivi2d-theme");
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved as string);
    expect(useThemeStore.getState().theme).toBe("light");
    expect(parsed.state.theme).toBe("light");
    expect(parsed.version).toBe(1);
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(JSON.parse(localStorage.getItem("vivi2d-theme")!)).toMatchObject({
      state: { theme: "dark" },
      version: 1,
    });
  });

  it("toggleTheme で localStorage に保存される", () => {
    useThemeStore.getState().toggleTheme();
    const after1 = JSON.parse(localStorage.getItem("vivi2d-theme") as string);
    expect(useThemeStore.getState().theme).toBe("light");
    expect(after1.state.theme).toBe("light");
    useThemeStore.getState().toggleTheme();
    const after2 = JSON.parse(localStorage.getItem("vivi2d-theme") as string);
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(after2.state.theme).toBe("dark");
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

    const { DEFAULT_THEME: freshDefaultTheme, useThemeStore: freshThemeStore } =
      await import("@/stores/themeStore");

    expect(freshDefaultTheme).toBe("dark");
    expect(freshThemeStore.getState().theme).toBe("dark");
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
