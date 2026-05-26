import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { exportGlb } from "@/lib/export/glb-exporter";
import { useI18nStore } from "@/lib/i18n";
import { clearTextures } from "@/lib/texture-store";
import { useNotificationStore } from "@/stores/notificationStore";
import * as projectIO from "@/stores/projectIO";
import { resetAllStores } from "@/test/store-reset";

vi.mock("@/lib/export/glb-exporter", () => ({
  exportGlb: vi.fn(),
}));

function seedProject(name = "coverage.psd") {
  projectIO.loadPsdFromBuffer(new ArrayBuffer(0), name);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByText(label));
}

describe("MenuBar extra coverage", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    useI18nStore.getState().setLocale("en");
    vi.clearAllMocks();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [{ name: "Layer 1", left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);
    (window as typeof window & { electronAPI: any }).electronAPI = {
      ...(window as typeof window & { electronAPI: any }).electronAPI,
      selectExportDirectory: vi.fn(),
      writeExportFiles: vi.fn(),
    };
  });

  it("opens and closes the media export dialog from the file menu", async () => {
    const user = userEvent.setup();
    seedProject();
    render(<MenuBar />);

    await openMenu(user, /File/i);
    await user.click(screen.getByText("Media Output"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Media Export")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText("Media Export")).not.toBeInTheDocument();
    });
  });

  it("opens and closes the shortcut settings dialog from the settings menu", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await openMenu(user, /Settings/i);
    await user.click(screen.getByText("Shortcuts"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Shortcut Settings")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText("Shortcut Settings")).not.toBeInTheDocument();
    });
  });

  it("opens the AI generate dialog from integrations and can close it", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await openMenu(user, /Integrations/i);
    await user.click(screen.getByText(/Generate Model/));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Automatic Model Generation")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText("Automatic Model Generation")).not.toBeInTheDocument();
    });
  });

  it("opens the ComfyUI settings dialog from integrations and can close it", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await openMenu(user, /Integrations/i);
    await user.click(screen.getByText(/ComfyUI Settings/));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ComfyUI Connection Settings")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText("ComfyUI Connection Settings")).not.toBeInTheDocument();
    });
  });

  it("exports GLB files and notifies on success", async () => {
    const user = userEvent.setup();
    seedProject("avatar.psd");
    vi.mocked(exportGlb).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(window.electronAPI.selectExportDirectory).mockResolvedValue("C:/exports");
    vi.mocked(window.electronAPI.writeExportFiles).mockResolvedValue({
      success: true,
      count: 1,
    });

    render(<MenuBar />);
    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Blender/));

    await waitFor(() => {
      expect(exportGlb).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.selectExportDirectory).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.writeExportFiles).toHaveBeenCalledTimes(1);
    });

    expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe("info");
  });

  it("does not write GLB files when the export directory picker is cancelled", async () => {
    const user = userEvent.setup();
    seedProject();
    vi.mocked(exportGlb).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    vi.mocked(window.electronAPI.selectExportDirectory).mockResolvedValue(null);

    render(<MenuBar />);
    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Blender/));

    await waitFor(() => {
      expect(exportGlb).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.selectExportDirectory).toHaveBeenCalledTimes(1);
    });
    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
  });

  it("reports GLB export failures through notifications", async () => {
    const user = userEvent.setup();
    seedProject();
    vi.mocked(exportGlb).mockRejectedValue(new Error("glb failed"));

    render(<MenuBar />);
    await openMenu(user, /File/i);
    await user.click(screen.getByText(/Blender/));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe("error");
    });
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain(
      "GLB export failed",
    );
  });
});
