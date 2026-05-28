import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "@/hooks/useDialog";


function flushMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => queueMicrotask(() => resolve()));
}

function buildDialog(innerHTML: string): HTMLDivElement {
  const dialog = document.createElement("div");
  dialog.innerHTML = innerHTML;
  document.body.appendChild(dialog);
  dialog.style.display = "block";
  return dialog;
}

describe("useDialog", () => {
  let dialog: HTMLDivElement;
  let previouslyFocused: HTMLButtonElement;

  beforeEach(() => {
    previouslyFocused = document.createElement("button");
    previouslyFocused.id = "prev-focus";
    previouslyFocused.textContent = "prev";
    document.body.appendChild(previouslyFocused);
    previouslyFocused.focus();
    dialog = buildDialog(
      '<button id="a">A</button><input id="b"/><button id="c">C</button>',
    );
  });

  afterEach(() => {
    dialog.remove();
    previouslyFocused.remove();
  });

  it("Escape キーで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    renderHook(() => useDialog({ dialogRef: { current: dialog }, onClose }));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disableEscape=true では Escape を無視する", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useDialog({
        dialogRef: { current: dialog },
        onClose,
        disableEscape: true,
      }),
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape 以外のキーでは onClose が呼ばれない", () => {
    const onClose = vi.fn();
    renderHook(() => useDialog({ dialogRef: { current: dialog }, onClose }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("初期フォーカスが最初の focusable 要素に移動する", async () => {
    renderHook(() => useDialog({ dialogRef: { current: dialog }, onClose: vi.fn() }));
    await flushMicrotasks();
    expect(document.activeElement?.id).toBe("a");
  });

  it("アンマウント時に previouslyFocused に戻る", async () => {
    const { unmount } = renderHook(() =>
      useDialog({ dialogRef: { current: dialog }, onClose: vi.fn() }),
    );
    await flushMicrotasks();
    unmount();
    expect(document.activeElement?.id).toBe("prev-focus");
  });

  it("previouslyFocused が DOM から外れていたらフォーカスを戻さない", async () => {
    const { unmount } = renderHook(() =>
      useDialog({ dialogRef: { current: dialog }, onClose: vi.fn() }),
    );
    await flushMicrotasks();
    previouslyFocused.remove();
    unmount();
    expect(document.activeElement?.id).not.toBe("prev-focus");
  });

  it("Tab で最後の要素に居たら最初にラップする", () => {
    renderHook(() => useDialog({ dialogRef: { current: dialog }, onClose: vi.fn() }));
    const last = dialog.querySelector<HTMLButtonElement>("#c")!;
    last.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    document.dispatchEvent(event);
    expect(document.activeElement?.id).toBe("a");
  });

  it("Shift+Tab で最初の要素に居たら最後にラップする", () => {
    renderHook(() => useDialog({ dialogRef: { current: dialog }, onClose: vi.fn() }));
    const first = dialog.querySelector<HTMLButtonElement>("#a")!;
    first.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
    expect(document.activeElement?.id).toBe("c");
  });

  it("disableFocusTrap=true では Tab のハンドラが動作しない", () => {
    renderHook(() =>
      useDialog({
        dialogRef: { current: dialog },
        onClose: vi.fn(),
        disableFocusTrap: true,
      }),
    );
    const last = dialog.querySelector<HTMLButtonElement>("#c")!;
    last.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    document.dispatchEvent(event);
    expect(document.activeElement?.id).toBe("c");
  });

  it("focusable 要素が無いダイアログでは Tab で preventDefault するだけ", () => {
    const empty = buildDialog("<div>no interactive children</div>");
    try {
      renderHook(() => useDialog({ dialogRef: { current: empty }, onClose: vi.fn() }));
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      empty.remove();
    }
  });

  it("disabled 要素は focusable から除外される", async () => {
    const disabledDialog = buildDialog(
      '<button id="x" disabled>X</button><button id="y">Y</button>',
    );
    try {
      renderHook(() =>
        useDialog({
          dialogRef: { current: disabledDialog },
          onClose: vi.fn(),
        }),
      );
      await flushMicrotasks();
      expect(document.activeElement?.id).toBe("y");
    } finally {
      disabledDialog.remove();
    }
  });

  it("ref.current が null でも落ちない", async () => {
    expect(() =>
      renderHook(() => useDialog({ dialogRef: { current: null }, onClose: vi.fn() })),
    ).not.toThrow();
    await flushMicrotasks();
  });
});
