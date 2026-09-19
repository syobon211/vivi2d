import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindingsEqual,
  bindingToString,
  DEFAULT_KEYMAP,
  eventToBinding,
  findConflicts,
  matchesBinding,
  useShortcutStore,
} from "@/stores/shortcutStore";
import { resetShortcutStore } from "@/test/store-reset";


describe("shortcutStore — 追加ブランチ", () => {
  beforeEach(() => {
    resetShortcutStore();
  });


  it("localStorage.setItem が例外を投げても saveKeymap はエラーにならない", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => {
      useShortcutStore.getState().setShortcut("undo", {
        key: "y",
        ctrl: true,
        shift: false,
        alt: false,
      });
    }).not.toThrow();

    spy.mockRestore();
  });



});

describe("bindingToString — フォーマット分岐", () => {
  it("Ctrl+Shift+Alt 全修飾キー付きの文字列", () => {
    expect(bindingToString({ key: "a", ctrl: true, shift: true, alt: true })).toBe(
      "Ctrl+Shift+Alt+A",
    );
  });


  it("ArrowUp は ↑ に変換される", () => {
    expect(
      bindingToString({ key: "ArrowUp", ctrl: false, shift: false, alt: false }),
    ).toBe("↑");
  });

  it("ArrowDown は ↓ に変換される", () => {
    expect(
      bindingToString({ key: "ArrowDown", ctrl: false, shift: false, alt: false }),
    ).toBe("↓");
  });

  it("ArrowLeft は ← に変換される", () => {
    expect(
      bindingToString({ key: "ArrowLeft", ctrl: false, shift: false, alt: false }),
    ).toBe("←");
  });

  it("ArrowRight は → に変換される", () => {
    expect(
      bindingToString({ key: "ArrowRight", ctrl: false, shift: false, alt: false }),
    ).toBe("→");
  });



});

describe("eventToBinding — イベント変換分岐", () => {


  it("metaKey が ctrl として扱われる", () => {
    const e = new KeyboardEvent("keydown", { key: "s", metaKey: true });
    const binding = eventToBinding(e);
    expect(binding.ctrl).toBe(true);
  });
});

describe("matchesBinding — 判定分岐", () => {
  it("矢印キーは直接キー名で比較される", () => {
    const e = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      ctrlKey: true,
    });
    expect(
      matchesBinding(e, { key: "ArrowUp", ctrl: true, shift: false, alt: false }),
    ).toBe(true);
    expect(
      matchesBinding(e, { key: "ArrowDown", ctrl: true, shift: false, alt: false }),
    ).toBe(false);
  });


  it("Alt の不一致で false を返す", () => {
    const e = new KeyboardEvent("keydown", { key: "a", altKey: true });
    expect(matchesBinding(e, { key: "a", ctrl: false, shift: false, alt: false })).toBe(
      false,
    );
  });
});

describe("findConflicts — 競合検出", () => {

  it("自分自身は競合に含まれない", () => {
    const keymap = { ...DEFAULT_KEYMAP };
    const conflicts = findConflicts(keymap, "undo", keymap.undo);
    expect(conflicts).not.toContain("undo");
  });

});

describe("bindingsEqual — 等値比較", () => {
  it("同一バインディングは true", () => {
    expect(
      bindingsEqual(
        { key: "z", ctrl: true, shift: false, alt: false },
        { key: "Z", ctrl: true, shift: false, alt: false },
      ),
    ).toBe(true);
  });

  it("異なるキーは false", () => {
    expect(
      bindingsEqual(
        { key: "z", ctrl: true, shift: false, alt: false },
        { key: "y", ctrl: true, shift: false, alt: false },
      ),
    ).toBe(false);
  });

  it("修飾キーの不一致は false", () => {
    expect(
      bindingsEqual(
        { key: "z", ctrl: true, shift: false, alt: false },
        { key: "z", ctrl: true, shift: true, alt: false },
      ),
    ).toBe(false);
  });
});
