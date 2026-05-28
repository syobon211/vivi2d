import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { ProjectDialogsHost } from "@/components/ProjectDialogsHost";
import { useI18nStore } from "@/lib/i18n";
import { clearTextures } from "@/lib/texture-store";
import * as projectIO from "@/stores/projectIO";
import { resetAllStores } from "@/test/store-reset";

function seedProject(name = "dialog-coverage.psd") {
  projectIO.loadPsdFromBuffer(new ArrayBuffer(0), name);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByText(label));
}

describe("MenuBar dialog coverage", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    useI18nStore.getState().setLocale("en");
    vi.clearAllMocks();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "Layer 1", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "Layer 2", left: 120, top: 0, right: 220, bottom: 100 },
      ],
    } as never);
  });

  it("opens and closes the validation dialog from the file menu", async () => {
    const user = userEvent.setup();
    seedProject();
    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
      </>,
    );

    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Validate/i));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Model Validation/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Model Validation/i)).not.toBeInTheDocument();
    });
  });

  it("opens the auto setup dialog from the file menu", async () => {
    const user = userEvent.setup();
    seedProject();
    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
      </>,
    );

    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Auto Setup/i));

    await screen.findByRole("dialog");
    expect(document.querySelector(".auto-setup-dialog")).not.toBeNull();
  });

  it("opens OBS and VTS settings dialogs from integrations", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
      </>,
    );

    await openMenu(user, /Integrations/i);
    const panel = document.querySelector(".menu-dropdown-panel");
    if (!(panel instanceof HTMLElement)) {
      throw new Error("Expected integrations menu panel");
    }
    const settingsItems = within(panel).getAllByText(/^Settings\.\.\.$/);

    await user.click(settingsItems[0]!);
    expect(await screen.findByDisplayValue("ws://127.0.0.1:4455")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("ws://127.0.0.1:4455")).not.toBeInTheDocument();
    });

    await openMenu(user, /Integrations/i);
    const nextPanel = document.querySelector(".menu-dropdown-panel");
    if (!(nextPanel instanceof HTMLElement)) {
      throw new Error("Expected integrations menu panel");
    }
    const nextSettingsItems = within(nextPanel).getAllByText(/^Settings\.\.\.$/);
    await user.click(nextSettingsItems[1]!);
    expect(await screen.findByDisplayValue("ws://127.0.0.1:8001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("ws://127.0.0.1:8001")).not.toBeInTheDocument();
    });
  });

  it("opens vivid import and export dialogs from the file menu", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
      </>,
    );

    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Import \.vivid/i));
    expect(await screen.findByText(/Import \.vivid/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    firstRender.unmount();

    seedProject();
    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
      </>,
    );
    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Export as \.vivid/i));
    expect(await screen.findByText(/Export as \.vivid/i)).toBeInTheDocument();
  });
});
