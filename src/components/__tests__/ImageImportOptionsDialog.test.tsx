import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageImportOptionsDialog } from "@/components/ImageImportOptionsDialog";
import { useI18nStore } from "@/lib/i18n";
import { resetAllStores } from "@/test/store-reset";

describe("ImageImportOptionsDialog", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("shows grouping only for batch-oriented import modes", () => {
    const noop = vi.fn();
    const { rerender } = render(
      <ImageImportOptionsDialog mode="importLayer" onCancel={noop} onConfirm={noop} />,
    );

    expect(
      screen.queryByText("Create group for imported layers"),
    ).not.toBeInTheDocument();

    rerender(
      <ImageImportOptionsDialog mode="importLayers" onCancel={noop} onConfirm={noop} />,
    );

    expect(screen.getByText("Create group for imported layers")).toBeInTheDocument();

    rerender(
      <ImageImportOptionsDialog mode="importFolder" onCancel={noop} onConfirm={noop} />,
    );

    expect(screen.getByText("Create group for imported layers")).toBeInTheDocument();
  });

  it("returns the selected options on confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ImageImportOptionsDialog
        mode="importLayers"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByLabelText("Center on canvas"));
    await user.click(screen.getByLabelText("Trim transparent bounds"));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        centerOnCanvas: true,
        trimTransparentBounds: true,
        createGroupForImportedLayers: false,
        autoGenerateMesh: false,
      }),
    );
  });
});
