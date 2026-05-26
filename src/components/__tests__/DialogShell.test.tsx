import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogShell } from "@/components/DialogShell";

describe("DialogShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders into document.body so the dialog is positioned relative to the app window", () => {
    const onClose = vi.fn();
    const { container } = render(
      <div data-testid="local-host">
        <DialogShell onClose={onClose} title="Portal Dialog">
          <p>Body</p>
        </DialogShell>
      </div>,
    );

    expect(container.querySelector(".modal-overlay")).toBeNull();

    const overlay = document.querySelector(".modal-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay?.parentElement).toBe(document.body);
    expect(screen.getByRole("dialog", { name: "Portal Dialog" })).toBeInTheDocument();
  });

  it("only closes from the backdrop, not from clicks inside the dialog content", () => {
    const onClose = vi.fn();
    render(
      <DialogShell onClose={onClose} title="Centered Dialog">
        <p>Body</p>
      </DialogShell>,
    );

    fireEvent.click(document.querySelector(".modal-content")!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
