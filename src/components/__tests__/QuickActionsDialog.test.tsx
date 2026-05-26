import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickActionsDialog } from "@/components/QuickActionsDialog";
import { useI18nStore } from "@/lib/i18n";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { resetAllStores } from "@/test/store-reset";

function RegistryHarness({
  enabled = true,
  reason,
  run,
}: {
  enabled?: boolean;
  reason?: string;
  run: () => void;
}) {
  const register = useQuickActionRegistryStore((s) => s.registerAction);
  const unregister = useQuickActionRegistryStore((s) => s.unregisterAction);

  useEffect(() => {
    register({
      id: "test.registry",
      section: "project",
      title: "Registry Action",
      description: "Delegated registry action",
      keywords: ["registry", "delegated"],
      order: 10,
      run,
      getAvailability: () => ({ enabled, reason }),
    });
    return () => {
      unregister("test.registry");
    };
  }, [enabled, reason, register, run, unregister]);

  return null;
}

describe("QuickActionsDialog", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
    act(() => {
      useQuickActionsStore.getState().openPalette();
    });
  });

  it("filters actions and shows disabled reasons", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(
      <>
        <RegistryHarness enabled={false} reason="Needs a clip" run={run} />
        <QuickActionsDialog />
      </>,
    );

    await user.type(screen.getByLabelText("Search actions"), "registry");

    const dialog = screen.getByRole("dialog");
    const action = within(dialog).getByRole("button", { name: /registry action/i });
    expect(action).toBeDisabled();
    expect(within(dialog).getByText("Needs a clip")).toBeInTheDocument();
  });

  it("runs direct actions and closes the palette", async () => {
    const user = userEvent.setup();
    render(<QuickActionsDialog />);

    await user.type(screen.getByLabelText("Search actions"), "mesh edit");
    await user.click(screen.getByRole("button", { name: /mesh/i }));

    expect(useViewportStore.getState().activeTool).toBe("meshEdit");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses Enter to run the first enabled result", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(
      <>
        <RegistryHarness run={run} />
        <QuickActionsDialog />
      </>,
    );

    await user.type(screen.getByLabelText("Search actions"), "registry");
    await user.keyboard("{Enter}");

    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can switch workspace modes directly", async () => {
    const user = userEvent.setup();
    render(<QuickActionsDialog />);

    await user.type(screen.getByLabelText("Search actions"), "animation workspace");
    await user.click(screen.getByRole("button", { name: /animation workspace/i }));

    expect(useWorkspaceModeStore.getState().mode).toBe("animation");
  });
});
