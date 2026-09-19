import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/themeStore";

describe("themeStore — 追加ブランチ", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "dark" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("localStorage.setItem が例外を投げても persistTheme はエラーにならない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => useThemeStore.getState().setTheme("light")).not.toThrow();
    expect(useThemeStore.getState().theme).toBe("light");
  });
});
