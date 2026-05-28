import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShortcutSettingsDialog } from "@/components/ShortcutSettingsDialog";
import { useI18nStore } from "@/lib/i18n";
import {
  DEFAULT_KEYMAP,
  SHORTCUT_ACTIONS,
  useShortcutStore,
} from "@/stores/shortcutStore";
import { resetShortcutStore } from "@/test/store-reset";

function exportButton() {
  return screen.getByRole("button", { name: /エクスポート|Export/i });
}

function importButton() {
  return screen.getByRole("button", { name: /インポート|Import/i });
}

describe("ShortcutSettingsDialog extra coverage", () => {
  beforeEach(() => {
    resetShortcutStore();
    useI18nStore.getState().setLocale("ja");
  });

  afterEach(() => {
    resetShortcutStore();
    useI18nStore.getState().setLocale("ja");
    vi.restoreAllMocks();
  });

  it("exports the current keymap through a blob download", async () => {
    const user = userEvent.setup();
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:shortcuts");
    const revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);

    await user.click(exportButton());

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:shortcuts");
  });

  it("imports a valid keymap file and clears the file input value", async () => {
    const updatedKeymap = {
      ...DEFAULT_KEYMAP,
      [SHORTCUT_ACTIONS[0]!]: {
        key: "y",
        ctrl: true,
        shift: true,
        alt: false,
      },
    };

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);

    await userEvent.setup().click(importButton());

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([JSON.stringify(updatedKeymap)], "shortcuts.json", {
      type: "application/json",
    });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(useShortcutStore.getState().keymap[SHORTCUT_ACTIONS[0]!]).toEqual(
        updatedKeymap[SHORTCUT_ACTIONS[0]!],
      );
    });
    expect(input.value).toBe("");
  });

  it("ignores invalid imported data and keeps the previous shortcut mapping", async () => {
    const action = SHORTCUT_ACTIONS[0]!;
    const originalBinding = useShortcutStore.getState().keymap[action];

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["not-json"], "broken.json", { type: "application/json" });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(useShortcutStore.getState().keymap[action]).toEqual(originalBinding);
    });
  });

  it("marks conflicting bindings and exposes the conflicting action labels in the tooltip", () => {
    useI18nStore.getState().setLocale("en");
    const [firstAction, secondAction] = SHORTCUT_ACTIONS;
    const conflictBinding = {
      key: "k",
      ctrl: true,
      shift: false,
      alt: false,
    };

    useShortcutStore.getState().setShortcut(firstAction!, conflictBinding);
    useShortcutStore.getState().setShortcut(secondAction!, conflictBinding);

    render(<ShortcutSettingsDialog onClose={vi.fn()} />);

    const firstRow = screen.getByText("Undo").closest(".shortcut-row");
    const secondRow = screen.getByText("Redo").closest(".shortcut-row");

    const firstButton = firstRow?.querySelector(".shortcut-key-btn");
    const secondButton = secondRow?.querySelector(".shortcut-key-btn");

    expect(firstButton).toHaveClass("conflict");
    expect(secondButton).toHaveClass("conflict");
    expect(firstButton).toHaveAttribute(
      "title",
      expect.stringContaining("Conflict: Redo"),
    );
  });
});
