import { describe, expect, it } from "vitest";
import { migrateComfyUI } from "@/stores/comfyuiStore";
import { DEFAULT_KEYMAP, migrateShortcut } from "@/stores/shortcutStore";
import { migrateTheme } from "@/stores/themeStore";

describe("migrateTheme", () => {
  it('preserves raw string "dark"', () => {
    const result = migrateTheme("dark", 0);
    expect(result.theme).toBe("dark");
  });

  it('preserves raw string "light"', () => {
    const result = migrateTheme("light", 0);
    expect(result.theme).toBe("light");
  });

  it("falls back to the OSS default dark theme for invalid values", () => {
    expect(migrateTheme(null, 0).theme).toBe("dark");
    expect(migrateTheme("unknown", 0).theme).toBe("dark");
    expect(migrateTheme({ theme: "unknown" }, 0).theme).toBe("dark");
  });

  it("preserves legacy persisted object theme values", () => {
    expect(migrateTheme({ theme: "light" }, 0).theme).toBe("light");
    expect(migrateTheme({ theme: "dark" }, 0).theme).toBe("dark");
  });
});

describe("migrateComfyUI", () => {
  it("uses a raw URL string as baseUrl", () => {
    const result = migrateComfyUI("http://192.168.1.10:8188", 0);
    expect(result.baseUrl).toBe("http://192.168.1.10:8188");
  });

  it("falls back to the default URL for non-string values", () => {
    expect(migrateComfyUI(null, 0).baseUrl).toBe("http://127.0.0.1:8188");
    expect(migrateComfyUI(undefined, 0).baseUrl).toBe("http://127.0.0.1:8188");
    expect(migrateComfyUI({ baseUrl: "x" }, 0).baseUrl).toBe("http://127.0.0.1:8188");
  });
});

describe("migrateShortcut", () => {
  it("maps the old ShortcutMap JSON shape into keymap", () => {
    const oldMap = {
      undo: { key: "q", ctrl: true, shift: false, alt: false },
    };
    const result = migrateShortcut(oldMap, 0);
    expect(result.keymap.undo.key).toBe("q");
    expect(result.keymap.redo.key).toBe(DEFAULT_KEYMAP.redo.key);
    expect(result.keymap.save.key).toBe(DEFAULT_KEYMAP.save.key);
  });

  it("returns DEFAULT_KEYMAP for null or non-object values", () => {
    expect(migrateShortcut(null, 0).keymap.undo.key).toBe(DEFAULT_KEYMAP.undo.key);
    expect(migrateShortcut("garbage", 0).keymap.redo.key).toBe(DEFAULT_KEYMAP.redo.key);
  });

  it("keeps DEFAULT_KEYMAP immutable from migrated results", () => {
    const result = migrateShortcut({}, 0);
    result.keymap.undo = { key: "x", ctrl: false, shift: false, alt: false };
    expect(DEFAULT_KEYMAP.undo.key).toBe("z");
  });
});
