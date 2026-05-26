import { beforeEach, describe, expect, it } from "vitest";
import {
  bindingsEqual,
  bindingToString,
  DEFAULT_KEYMAP,
  eventToBinding,
  findConflicts,
  matchesBinding,
  type ShortcutBinding,
  useShortcutStore,
} from "@/stores/shortcutStore";

function resetStore() {
  useShortcutStore.setState({ keymap: { ...DEFAULT_KEYMAP } });
}

function mockKeyEvent(init: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: init.key,
    code: init.code ?? "",
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
    repeat: init.repeat ?? false,
  });
}

describe("shortcutStore", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  // ============================================================
  // bindingToString
  // ============================================================
  describe("bindingToString", () => {
    it("修飾キーなしの単一キー", () => {
      expect(bindingToString({ key: "v", ctrl: false, shift: false, alt: false })).toBe(
        "V",
      );
    });

    it("Ctrl+キー", () => {
      expect(bindingToString({ key: "z", ctrl: true, shift: false, alt: false })).toBe(
        "Ctrl+Z",
      );
    });

    it("Ctrl+Shift+キー", () => {
      expect(bindingToString({ key: "z", ctrl: true, shift: true, alt: false })).toBe(
        "Ctrl+Shift+Z",
      );
    });

    it("矢印キーの表示", () => {
      expect(
        bindingToString({
          key: "ArrowUp",
          ctrl: true,
          shift: false,
          alt: false,
        }),
      ).toBe("Ctrl+↑");
    });

    it("Space キーの表示", () => {
      expect(
        bindingToString({
          key: "Space",
          ctrl: false,
          shift: false,
          alt: false,
        }),
      ).toBe("Space");
    });
  });

  // ============================================================
  // matchesBinding
  // ============================================================
  describe("matchesBinding", () => {
    it("Ctrl+Z が undo バインディングに一致する", () => {
      const e = mockKeyEvent({ key: "z", ctrlKey: true });
      expect(matchesBinding(e, DEFAULT_KEYMAP.undo)).toBe(true);
    });

    it("Ctrl+Shift+Z が redo バインディングに一致する", () => {
      const e = mockKeyEvent({ key: "z", ctrlKey: true, shiftKey: true });
      expect(matchesBinding(e, DEFAULT_KEYMAP.redo)).toBe(true);
    });

    it("Ctrl+Z は redo バインディングに一致しない（shift 不一致）", () => {
      const e = mockKeyEvent({ key: "z", ctrlKey: true });
      expect(matchesBinding(e, DEFAULT_KEYMAP.redo)).toBe(false);
    });

    it("大文字 V も toolSelect バインディングに一致する", () => {
      const e = mockKeyEvent({ key: "V" });
      expect(matchesBinding(e, DEFAULT_KEYMAP.toolSelect)).toBe(true);
    });

    it("Ctrl+V は toolSelect バインディングに一致しない", () => {
      const e = mockKeyEvent({ key: "v", ctrlKey: true });
      expect(matchesBinding(e, DEFAULT_KEYMAP.toolSelect)).toBe(false);
    });

    it("Space が tempPan バインディングに一致する", () => {
      const e = mockKeyEvent({ key: " ", code: "Space" });
      expect(matchesBinding(e, DEFAULT_KEYMAP.tempPan)).toBe(true);
    });

    it("Meta+Z が undo バインディングに一致する（Mac対応）", () => {
      const e = mockKeyEvent({ key: "z", metaKey: true });
      expect(matchesBinding(e, DEFAULT_KEYMAP.undo)).toBe(true);
    });
  });

  // ============================================================
  // eventToBinding
  // ============================================================
  describe("eventToBinding", () => {
    it("Ctrl+Shift+S をバインディングに変換", () => {
      const e = mockKeyEvent({ key: "S", ctrlKey: true, shiftKey: true });
      const b = eventToBinding(e);
      expect(b.key).toBe("s");
      expect(b.ctrl).toBe(true);
      expect(b.shift).toBe(true);
      expect(b.alt).toBe(false);
    });

    it("Space をバインディングに変換", () => {
      const e = mockKeyEvent({ key: " ", code: "Space" });
      const b = eventToBinding(e);
      expect(b.key).toBe("Space");
    });
  });

  // ============================================================
  // bindingsEqual / findConflicts
  // ============================================================
  describe("findConflicts", () => {
    it("同じバインディングを持つアクションを検出する", () => {
      const binding: ShortcutBinding = {
        key: "z",
        ctrl: true,
        shift: false,
        alt: false,
      };
      const conflicts = findConflicts(DEFAULT_KEYMAP, "redo", binding);
      expect(conflicts).toContain("undo");
    });

    it("競合がない場合は空配列", () => {
      const binding: ShortcutBinding = {
        key: "q",
        ctrl: true,
        shift: false,
        alt: false,
      };
      const conflicts = findConflicts(DEFAULT_KEYMAP, "undo", binding);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("ストアアクション", () => {
    it("setShortcut でバインディングを変更できる", () => {
      const newBinding: ShortcutBinding = {
        key: "y",
        ctrl: true,
        shift: false,
        alt: false,
      };
      useShortcutStore.getState().setShortcut("redo", newBinding);

      const keymap = useShortcutStore.getState().keymap;
      expect(keymap.redo.key).toBe("y");
      expect(keymap.redo.ctrl).toBe(true);
    });

    it("resetShortcut で個別アクションをデフォルトに戻せる", () => {
      useShortcutStore.getState().setShortcut("undo", {
        key: "q",
        ctrl: true,
        shift: false,
        alt: false,
      });
      useShortcutStore.getState().resetShortcut("undo");

      const keymap = useShortcutStore.getState().keymap;
      expect(bindingsEqual(keymap.undo, DEFAULT_KEYMAP.undo)).toBe(true);
    });

    it("resetAll で全てをデフォルトに戻せる", () => {
      useShortcutStore.getState().setShortcut("undo", {
        key: "q",
        ctrl: true,
        shift: false,
        alt: false,
      });
      useShortcutStore.getState().setShortcut("redo", {
        key: "w",
        ctrl: true,
        shift: false,
        alt: false,
      });

      useShortcutStore.getState().resetAll();

      const keymap = useShortcutStore.getState().keymap;
      expect(bindingsEqual(keymap.undo, DEFAULT_KEYMAP.undo)).toBe(true);
      expect(bindingsEqual(keymap.redo, DEFAULT_KEYMAP.redo)).toBe(true);
    });

    it("importKeymap でキーマップを上書きできる", () => {
      useShortcutStore.getState().importKeymap({
        undo: { key: "q", ctrl: true, shift: false, alt: false },
      });

      const keymap = useShortcutStore.getState().keymap;
      expect(keymap.undo.key).toBe("q");
      expect(bindingsEqual(keymap.redo, DEFAULT_KEYMAP.redo)).toBe(true);
    });

    it("setShortcut が localStorage に保存される", () => {
      useShortcutStore.getState().setShortcut("undo", {
        key: "y",
        ctrl: true,
        shift: false,
        alt: false,
      });

      const saved = localStorage.getItem("vivi2d-shortcuts");
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.state.keymap.undo.key).toBe("y");
      expect(parsed.version).toBe(1);
    });
  });

  describe("formatKey / bindingToString — 追加分岐", () => {
    it("複数文字キー（非矢印・非Space）はそのまま表示", () => {
      expect(
        bindingToString({ key: "Delete", ctrl: false, shift: false, alt: false }),
      ).toBe("Delete");
      expect(
        bindingToString({ key: "Escape", ctrl: false, shift: false, alt: false }),
      ).toBe("Escape");
      expect(
        bindingToString({ key: "Enter", ctrl: false, shift: false, alt: false }),
      ).toBe("Enter");
    });

    it("半角スペース文字もSpaceと表示される", () => {
      expect(bindingToString({ key: " ", ctrl: false, shift: false, alt: false })).toBe(
        "Space",
      );
    });

    it("Alt修飾キー付き", () => {
      expect(bindingToString({ key: "a", ctrl: false, shift: false, alt: true })).toBe(
        "Alt+A",
      );
    });
  });

  describe("matchesBinding — 追加分岐", () => {
    it("矢印キーバインディングに一致する", () => {
      const arrowBinding: ShortcutBinding = {
        key: "ArrowUp",
        ctrl: false,
        shift: false,
        alt: false,
      };
      const e = mockKeyEvent({ key: "ArrowUp" });
      expect(matchesBinding(e, arrowBinding)).toBe(true);
    });

    it("矢印キーバインディングに別のキーは一致しない", () => {
      const arrowBinding: ShortcutBinding = {
        key: "ArrowUp",
        ctrl: false,
        shift: false,
        alt: false,
      };
      const e = mockKeyEvent({ key: "ArrowDown" });
      expect(matchesBinding(e, arrowBinding)).toBe(false);
    });

    it("複数文字バインディングのフォールバック比較", () => {
      const binding: ShortcutBinding = {
        key: "Delete",
        ctrl: false,
        shift: false,
        alt: false,
      };
      const eMatch = mockKeyEvent({ key: "Delete" });
      const eMiss = mockKeyEvent({ key: "Backspace" });
      expect(matchesBinding(eMatch, binding)).toBe(true);
      expect(matchesBinding(eMiss, binding)).toBe(false);
    });

    it("alt不一致で false", () => {
      const binding: ShortcutBinding = {
        key: "a",
        ctrl: false,
        shift: false,
        alt: true,
      };
      const e = mockKeyEvent({ key: "a", altKey: false });
      expect(matchesBinding(e, binding)).toBe(false);
    });
  });

  describe("eventToBinding — 追加分岐", () => {
    it("複数文字キー（非Space）はそのまま保持", () => {
      const e = mockKeyEvent({ key: "Delete", code: "Delete" });
      const b = eventToBinding(e);
      expect(b.key).toBe("Delete");
    });

    it("Alt キーが反映される", () => {
      const e = mockKeyEvent({ key: "a", altKey: true });
      const b = eventToBinding(e);
      expect(b.alt).toBe(true);
    });
  });

  describe("loadKeymap — localStorage 異常系", () => {
    it("localStorage に不正な JSON がある場合はデフォルトを返す", () => {
      localStorage.setItem("vivi2d-shortcuts", "invalid json{{{");
      useShortcutStore.getState().resetAll();
      const keymap = useShortcutStore.getState().keymap;
      expect(keymap.undo.key).toBe(DEFAULT_KEYMAP.undo.key);
    });

    it("localStorage に保存されたキーマップがデフォルトとマージされる", () => {
      localStorage.setItem(
        "vivi2d-shortcuts",
        JSON.stringify({ undo: { key: "q", ctrl: true, shift: false, alt: false } }),
      );
      useShortcutStore
        .getState()
        .importKeymap(JSON.parse(localStorage.getItem("vivi2d-shortcuts")!));
      const keymap = useShortcutStore.getState().keymap;
      expect(keymap.undo.key).toBe("q");
      expect(keymap.redo.key).toBe(DEFAULT_KEYMAP.redo.key);
    });
  });
});
