const comfyUiMocks = vi.hoisted(() => ({
  inspectViviCompatSupport: vi.fn(),
}));

vi.mock("@vivi2d/provider-comfyui", async () => {
  const actual = await vi.importActual<typeof import("@vivi2d/provider-comfyui")>(
    "@vivi2d/provider-comfyui",
  );
  return {
    ...actual,
    inspectViviCompatSupport: comfyUiMocks.inspectViviCompatSupport,
  };
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { resetAllStores } from "@/test/store-reset";
import { ComfyUISettingsDialog } from "../ComfyUISettingsDialog";

describe("ComfyUISettingsDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
    useComfyUIStore.getState().clearCompat();
    useComfyUIStore.getState().setBaseUrl("http://127.0.0.1:8188");
    vi.clearAllMocks();
    comfyUiMocks.inspectViviCompatSupport.mockResolvedValue({
      supported: true,
      hasDecomposeNode: true,
      hasExportNode: true,
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      issues: [],
    });
  });

  it("renders the dialog title", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    expect(screen.getByText(/ComfyUI.*Connection Settings/i)).toBeInTheDocument();
  });

  it("shows the current base URL", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    expect(screen.getByDisplayValue("http://127.0.0.1:8188")).toBeInTheDocument();
  });

  it("shows the test connection action", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    expect(screen.getByText(/Test Connection/i)).toBeInTheDocument();
  });

  it("saves the edited URL and closes the dialog", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    const input = screen.getByDisplayValue("http://127.0.0.1:8188");
    fireEvent.change(input, { target: { value: "http://192.168.1.100:8188" } });

    fireEvent.click(screen.getByText(/Save/i));

    expect(useComfyUIStore.getState().baseUrl).toBe("http://192.168.1.100:8188");
    expect(useComfyUIStore.getState().connected).toBe(false);
    expect(useComfyUIStore.getState().compatStatus).toBe("unknown");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the dialog when cancel is pressed", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the ComfyUI setup notice", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    expect(screen.getByText(/ComfyUI.*running/i)).toBeInTheDocument();
  });

  it("closes when the overlay is clicked", () => {
    render(<ComfyUISettingsDialog onClose={onClose} />);
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a success state and caches compat-ready details when the connection test passes", async () => {
    const originalAPI = window.electronAPI;
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: vi.fn().mockResolvedValue({ ok: true }),
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Test Connection/i));

    await vi.waitFor(() => {
      expect(screen.getByText(/Success|Connected/i)).toBeInTheDocument();
    });
    await vi.waitFor(() => {
      expect(
        screen.getByText(
          /Vivi2D compat plugin detected|Using the Vivi2D compat workflow/i,
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Manifest schema/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Plugin version/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Compat nodes/i)).toBeInTheDocument();
    expect(screen.getByText(/decompose OK \/ export OK/)).toBeInTheDocument();
    expect(screen.getByText(/Capability/i)).toBeInTheDocument();
    expect(screen.getByText(/vivi2d\.seethrough\.v1/)).toBeInTheDocument();

    const state = useComfyUIStore.getState();
    expect(state.connected).toBe(true);
    expect(state.compatStatus).toBe("ready");
    expect(state.compatBaseUrl).toBe("http://127.0.0.1:8188");
    expect(state.compatCapability).toBe("vivi2d.seethrough.v1");
    expect(state.compatPluginVersion).toBe("0.1.0");
    expect(state.compatManifestSchema).toBe("1.0.0");
    expect(state.compatHasDecomposeNode).toBe(true);
    expect(state.compatHasExportNode).toBe(true);

    window.electronAPI = originalAPI;
  });

  it("shows fallback status and caches compat issues when the plugin is missing", async () => {
    comfyUiMocks.inspectViviCompatSupport.mockResolvedValue({
      supported: false,
      hasDecomposeNode: false,
      hasExportNode: false,
      capability: null,
      pluginVersion: null,
      manifestSchema: null,
      issues: ["Missing node: ViviSeeThroughDecompose"],
    });

    const originalAPI = window.electronAPI;
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: vi.fn().mockResolvedValue({ ok: true }),
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Test Connection/i));

    await vi.waitFor(() => {
      expect(useComfyUIStore.getState().compatStatus).toBe("missing");
    });

    expect(
      screen.getByText(
        /was not detected|Falling back to the legacy See-through workflow/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Compat check issue/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing node: ViviSeeThroughDecompose/)).toBeInTheDocument();
    expect(screen.getByText(/decompose Missing \/ export Missing/)).toBeInTheDocument();

    const state = useComfyUIStore.getState();
    expect(state.compatStatus).toBe("missing");
    expect(state.compatBaseUrl).toBe("http://127.0.0.1:8188");
    expect(state.compatHasDecomposeNode).toBe(false);
    expect(state.compatHasExportNode).toBe(false);
    expect(state.compatIssues).toContain("Missing node: ViviSeeThroughDecompose");

    window.electronAPI = originalAPI;
  });

  it("shows an error state when the ping result is false", async () => {
    const originalAPI = window.electronAPI;
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: vi.fn().mockResolvedValue({ ok: false }),
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Test Connection/i));

    await vi.waitFor(() => {
      expect(screen.getByText(/Error|Failed/i)).toBeInTheDocument();
    });
    expect(useComfyUIStore.getState().connected).toBe(false);
    expect(useComfyUIStore.getState().compatStatus).toBe("unknown");

    window.electronAPI = originalAPI;
  });

  it("shows an error state when the ping throws", async () => {
    const originalAPI = window.electronAPI;
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: vi.fn().mockRejectedValue(new Error("Network error")),
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Test Connection/i));

    await vi.waitFor(() => {
      expect(screen.getByText(/Error|Failed/i)).toBeInTheDocument();
    });
    expect(useComfyUIStore.getState().connected).toBe(false);
    expect(useComfyUIStore.getState().compatStatus).toBe("unknown");

    window.electronAPI = originalAPI;
  });

  it("disables the test button while the ping is pending", async () => {
    const originalAPI = window.electronAPI;
    let resolvePing: ((value: { ok: boolean }) => void) | undefined;
    const pendingPing = new Promise<{ ok: boolean }>((resolve) => {
      resolvePing = resolve;
    });
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: vi.fn().mockReturnValue(pendingPing),
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    const testLabel = screen.getByText(/Test Connection/i);
    const testButton = testLabel.closest("button");
    fireEvent.click(testLabel);

    await vi.waitFor(() => {
      expect(testButton).toBeDisabled();
    });

    resolvePing?.({ ok: true });

    await vi.waitFor(() => {
      expect(testButton).not.toBeDisabled();
    });

    window.electronAPI = originalAPI;
  });

  it("uses the edited URL when testing the connection", async () => {
    const mockPing = vi.fn().mockResolvedValue({ ok: true });
    const originalAPI = window.electronAPI;
    window.electronAPI = {
      ...originalAPI,
      comfyuiPing: mockPing,
    } as any;

    render(<ComfyUISettingsDialog onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue("http://127.0.0.1:8188"), {
      target: { value: "http://localhost:9999" },
    });
    fireEvent.click(screen.getByText(/Test Connection/i));

    await vi.waitFor(() => {
      expect(mockPing).toHaveBeenCalledWith({ baseUrl: "http://localhost:9999" });
    });

    window.electronAPI = originalAPI;
  });
});
