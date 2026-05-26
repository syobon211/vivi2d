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

  it("localStorage に不正な JSON がある場合、デフォルトキーマップを使用する", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("INVALID_JSON{{{");
    useShortcutStore.setState({ keymap: { ...DEFAULT_KEYMAP } });
    spy.mockRestore();
    expect(useShortcutStore.getState().keymap.undo.key).toBe("z");
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

  it("importKeymap でデフォルトとマージされる", () => {
    useShortcutStore.getState().importKeymap({
      undo: { key: "y", ctrl: true, shift: false, alt: false },
    });

    const keymap = useShortcutStore.getState().keymap;
    expect(keymap.undo.key).toBe("y");
    expect(keymap.redo.key).toBe("z");
    expect(keymap.redo.shift).toBe(true);
  });

  it("resetShortcut で個別アクションをデフォルトに戻す", () => {
    useShortcutStore.getState().setShortcut("save", {
      key: "d",
      ctrl: true,
      shift: false,
      alt: false,
    });
    expect(useShortcutStore.getState().keymap.save.key).toBe("d");

    useShortcutStore.getState().resetShortcut("save");
    expect(useShortcutStore.getState().keymap.save.key).toBe("s");
  });

  it("resetAll で全アクションをデフォルトに戻す", () => {
    useShortcutStore.getState().setShortcut("save", {
      key: "d",
      ctrl: true,
      shift: false,
      alt: false,
    });
    useShortcutStore.getState().setShortcut("undo", {
      key: "y",
      ctrl: true,
      shift: false,
      alt: false,
    });

    useShortcutStore.getState().resetAll();

    const keymap = useShortcutStore.getState().keymap;
    expect(keymap.save.key).toBe("s");
    expect(keymap.undo.key).toBe("z");
  });
});

describe("bindingToString — フォーマット分岐", () => {
  it("Ctrl+Shift+Alt 全修飾キー付きの文字列", () => {
    expect(bindingToString({ key: "a", ctrl: true, shift: true, alt: true })).toBe(
      "Ctrl+Shift+Alt+A",
    );
  });

  it("修飾キーなし単一キー", () => {
    expect(bindingToString({ key: "v", ctrl: false, shift: false, alt: false })).toBe(
      "V",
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

  it("Space キーは Space と表示される", () => {
    expect(bindingToString({ key: "Space", ctrl: false, shift: false, alt: false })).toBe(
      "Space",
    );
  });

  it("半角スペース（' '）は Space と表示される", () => {
    expect(bindingToString({ key: " ", ctrl: false, shift: false, alt: false })).toBe(
      "Space",
    );
  });

  it("複数文字キー名はそのまま表示される", () => {
    expect(
      bindingToString({ key: "Escape", ctrl: false, shift: false, alt: false }),
    ).toBe("Escape");
  });
});

describe("eventToBinding — イベント変換分岐", () => {
  it("Space キーの code で判定される", () => {
    const e = new KeyboardEvent("keydown", { code: "Space", key: " " });
    const binding = eventToBinding(e);
    expect(binding.key).toBe("Space");
  });

  it("1文字キーは小文字に正規化される", () => {
    const e = new KeyboardEvent("keydown", { key: "A" });
    const binding = eventToBinding(e);
    expect(binding.key).toBe("a");
  });

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

  it("複数文字キー名は直接比較される", () => {
    const e = new KeyboardEvent("keydown", { key: "Escape" });
    expect(
      matchesBinding(e, { key: "Escape", ctrl: false, shift: false, alt: false }),
    ).toBe(true);
  });

  it("Alt の不一致で false を返す", () => {
    const e = new KeyboardEvent("keydown", { key: "a", altKey: true });
    expect(matchesBinding(e, { key: "a", ctrl: false, shift: false, alt: false })).toBe(
      false,
    );
  });
});

describe("findConflicts — 競合検出", () => {
  it("競合するアクションを返す", () => {
    const keymap = { ...DEFAULT_KEYMAP };
    const conflicts = findConflicts(keymap, "save", keymap.undo);
    expect(conflicts).toContain("undo");
  });

  it("自分自身は競合に含まれない", () => {
    const keymap = { ...DEFAULT_KEYMAP };
    const conflicts = findConflicts(keymap, "undo", keymap.undo);
    expect(conflicts).not.toContain("undo");
  });

  it("競合がない場合は空配列を返す", () => {
    const keymap = { ...DEFAULT_KEYMAP };
    const uniqueBinding = { key: "x", ctrl: true, shift: true, alt: true };
    const conflicts = findConflicts(keymap, "save", uniqueBinding);
    expect(conflicts).toEqual([]);
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
