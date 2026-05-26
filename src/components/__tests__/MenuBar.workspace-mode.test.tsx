import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { useI18nStore } from "@/lib/i18n";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { resetAllStores } from "@/test/store-reset";

describe("MenuBar workspace mode", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("switches into the rigging workspace from the View menu", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByText(/View/i));
    await user.click(screen.getByTitle("Show the rigging-focused workspace"));

    expect(useWorkspaceModeStore.getState().mode).toBe("rigging");
    expect(screen.getAllByText("Rigging workspace")).toHaveLength(1);
  });

  it("shows the active workspace entry when the rigging workspace is selected", async () => {
    const user = userEvent.setup();
    useWorkspaceModeStore.getState().setMode("rigging");
    render(<MenuBar />);

    await user.click(screen.getByText(/View/i));

    expect(screen.getByTitle("Show the rigging-focused workspace")).toHaveClass("active");
    expect(screen.getByTitle("Show the default editing workspace")).not.toHaveClass(
      "active",
    );
    expect(screen.getAllByText("Rigging workspace")).toHaveLength(2);
  });

  it("switches into the animation workspace from the View menu", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByText(/View/i));
    await user.click(screen.getByTitle("Show the animation-focused workspace"));

    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
    expect(screen.getAllByText("Animation workspace")).toHaveLength(1);
  });
});
