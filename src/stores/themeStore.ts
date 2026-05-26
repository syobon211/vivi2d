import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type ThemeName = "dark" | "light";
export const DEFAULT_THEME: ThemeName = "dark";

interface ThemeState {
  theme: ThemeName;
}

interface ThemeActions {
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

export type ThemeStore = ThemeState & ThemeActions;

export function migrateTheme(persistedState: unknown, _version: number): ThemeStore {
  const candidate =
    persistedState !== null && typeof persistedState === "object"
      ? (persistedState as { theme?: unknown }).theme
      : persistedState;
  const value = candidate === "dark" || candidate === "light" ? candidate : DEFAULT_THEME;
  return { theme: value } as ThemeStore;
}

export const useThemeStore = create<ThemeStore>()(
  withStandardMiddleware<ThemeStore>(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) =>
        set((s) => {
          s.theme = theme;
        }),
      toggleTheme: () =>
        set((s) => {
          s.theme = s.theme === "dark" ? "light" : "dark";
        }),
    }),
    {
      name: "ThemeStore",
      persistKey: "vivi2d-theme",
      persistVersion: 1,
      partialize: (s) => ({ theme: s.theme }),
      migrate: migrateTheme,
    },
  ),
);
