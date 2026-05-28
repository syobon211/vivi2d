import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useComfyUIStore } from "@/stores/comfyuiStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { resetAllStores } from "@/test/store-reset";
import { AIGenerateDialog } from "../AIGenerateDialog";

const comfyUiMocks = vi.hoisted(() => ({
  decomposeImageToPsd: vi.fn(),
  decomposeImageToNativeImportBundleCompat: vi.fn(),
  exportCompatManifestToPsd: vi.fn(),
  generateFromPromptToPsd: vi.fn(),
  generateFromPromptToNativeImportBundleCompat: vi.fn(),
  createComfyUIProvider: vi.fn(() => ({ id: "mock-provider" })),
  invokeProvider: vi.fn(),
  inspectViviCompatSupport: vi.fn(),
  loadPsdFromBufferAsync: vi.fn(),
  loadSeeThroughNativeImportBundleAsync: vi.fn(),
  ComfyUIClient: vi.fn(function MockComfyUIClient() {
    return {};
  }),
  ElectronComfyUITransport: vi.fn(function MockElectronComfyUITransport() {
    return {};
  }),
}));

vi.mock("@vivi2d/provider-comfyui", () => ({
  ComfyUIClient: comfyUiMocks.ComfyUIClient,
  createComfyUIProvider: comfyUiMocks.createComfyUIProvider,
  decomposeImageToPsd: comfyUiMocks.decomposeImageToPsd,
  decomposeImageToNativeImportBundleCompat:
    comfyUiMocks.decomposeImageToNativeImportBundleCompat,
  exportCompatManifestToPsd: comfyUiMocks.exportCompatManifestToPsd,
  generateFromPromptToPsd: comfyUiMocks.generateFromPromptToPsd,
  generateFromPromptToNativeImportBundleCompat:
    comfyUiMocks.generateFromPromptToNativeImportBundleCompat,
  inspectViviCompatSupport: comfyUiMocks.inspectViviCompatSupport,
}));

vi.mock("@vivi2d/provider-sdk", () => ({
  VIVI_PROVIDER_CAPABILITIES: {
    layerDecompose: "vivi2d.provider.layerDecompose.v1",
    promptToLayerManifest: "vivi2d.provider.promptToLayerManifest.v1",
    manifestToPsd: "vivi2d.provider.manifestToPsd.v1",
  },
}));

vi.mock("@vivi2d/provider-sdk/invocation", () => ({
  invokeProvider: comfyUiMocks.invokeProvider,
}));

vi.mock("@/lib/comfyui-electron-transport", () => ({
  ElectronComfyUITransport: comfyUiMocks.ElectronComfyUITransport,
}));

vi.mock("@/stores/projectIO", () => ({
  loadPsdFromBufferAsync: comfyUiMocks.loadPsdFromBufferAsync,
  loadSeeThroughNativeImportBundleAsync:
    comfyUiMocks.loadSeeThroughNativeImportBundleAsync,
}));

function getPrimaryAction(): HTMLButtonElement {
  const buttons = screen.getAllByRole("button");
  const primary = buttons.find(
    (button) =>
      button.classList.contains("prop-btn") &&
      !/close|cancel/i.test(button.textContent ?? ""),
  );
  if (!(primary instanceof HTMLButtonElement)) {
    throw new Error("Primary AI action button was not found.");
  }
  return primary;
}

describe("AIGenerateDialog async flows", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    useI18nStore.getState().setLocale("en");
    useComfyUIStore.getState().reset();
    useComfyUIStore.getState().clearCompat();
    useComfyUIStore.getState().setBaseUrl("http://127.0.0.1:8188");
    comfyUiMocks.inspectViviCompatSupport.mockResolvedValue({
      supported: true,
      hasDecomposeNode: true,
      hasExportNode: true,
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      issues: [],
    });
    (window as typeof window & { electronAPI: any }).electronAPI.openImageFile = vi.fn();
    (window as typeof window & { electronAPI: any }).electronAPI.readImageFile = vi.fn();
    comfyUiMocks.loadSeeThroughNativeImportBundleAsync.mockResolvedValue(true);
  });

  function makeManifest() {
    return {
      schema_version: "1.0.0" as const,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 1280, height: 720 },
      layers: [],
    };
  }

  function encodeJsonBuffer(value: unknown): ArrayBuffer {
    return new TextEncoder().encode(JSON.stringify(value)).buffer;
  }

  function providerResultFromBundle(bundle: {
    manifestPath: string;
    manifest: ReturnType<typeof makeManifest>;
    layerAssets: Array<{ image_path: string; imageData: ArrayBuffer }>;
  }) {
    return {
      artifacts: [
        {
          id: "manifest",
          kind: "manifest",
          mediaType: "application/json",
          byteLength: encodeJsonBuffer(bundle.manifest).byteLength,
          path: bundle.manifestPath,
          data: encodeJsonBuffer(bundle.manifest),
          metadata: { manifestPath: bundle.manifestPath },
        },
        ...bundle.layerAssets.map((asset, index) => ({
          id: `layer-${index}`,
          kind: "layerImage",
          mediaType: "image/png",
          byteLength: asset.imageData.byteLength,
          path: asset.image_path,
          data: asset.imageData,
          metadata: { imagePath: asset.image_path },
        })),
      ],
    };
  }

  function providerPsdResult(psdBuffer: ArrayBuffer) {
    return {
      artifacts: [
        {
          id: "psd",
          kind: "psd",
          mediaType: "image/vnd.adobe.photoshop",
          byteLength: psdBuffer.byteLength,
          data: psdBuffer,
        },
      ],
    };
  }

  it("shows compat-ready status after probe succeeds", async () => {
    render(<AIGenerateDialog onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/vivi2d compat plugin detected/i)).toBeInTheDocument();
    });
  });

  it("reuses cached compat state without probing again", async () => {
    useComfyUIStore.getState().setCompatSupported("http://127.0.0.1:8188", {
      capability: "vivi2d.seethrough.v1",
      pluginVersion: "0.1.0",
      manifestSchema: "1.0.0",
      hasDecomposeNode: true,
      hasExportNode: true,
      issues: [],
    });

    render(<AIGenerateDialog onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/vivi2d compat plugin detected/i)).toBeInTheDocument();
    });
    expect(comfyUiMocks.inspectViviCompatSupport).not.toHaveBeenCalled();
  });

  it("runs the image workflow through the native import bundle path and closes on success", async () => {
    const user = userEvent.setup();
    const nativeBundle = {
      manifestPath: "vivi2d/decompose/job/manifest.json",
      manifest: makeManifest(),
      layerAssets: [
        {
          image_path: "layers/layer_000.png",
          imageData: new ArrayBuffer(8),
        },
      ],
    };

    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.openImageFile.mockResolvedValue("C:/tmp/input.png");
    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.readImageFile.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
    });
    comfyUiMocks.invokeProvider.mockImplementation(
      async (_provider, _request, options) => {
        options?.onProgress?.({ phase: "uploading", step: 12, total: 100 });
        return providerResultFromBundle(nativeBundle);
      },
    );

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(comfyUiMocks.invokeProvider).toHaveBeenCalledOnce();
      expect(comfyUiMocks.loadSeeThroughNativeImportBundleAsync).toHaveBeenCalledWith(
        nativeBundle,
        "see-through.psd",
        { notifyOnError: false },
      );
    });

    expect(comfyUiMocks.decomposeImageToPsd).not.toHaveBeenCalled();
    expect(comfyUiMocks.exportCompatManifestToPsd).not.toHaveBeenCalled();
    expect(comfyUiMocks.loadPsdFromBufferAsync).not.toHaveBeenCalled();

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]?.type).toBe("info");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useComfyUIStore.getState().generating).toBe(false);
    expect(useComfyUIStore.getState().progressPercent).toBe(100);
  });

  it("does not start the image workflow when the picker is cancelled", async () => {
    const user = userEvent.setup();
    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.openImageFile.mockResolvedValue(null);

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(
        (window as typeof window & { electronAPI: any }).electronAPI.openImageFile,
      ).toHaveBeenCalledOnce();
    });
    expect(comfyUiMocks.invokeProvider).not.toHaveBeenCalled();
    expect(comfyUiMocks.decomposeImageToPsd).not.toHaveBeenCalled();
    expect(comfyUiMocks.loadPsdFromBufferAsync).not.toHaveBeenCalled();
    expect(comfyUiMocks.loadSeeThroughNativeImportBundleAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to the legacy prompt workflow when compat support is unavailable", async () => {
    const user = userEvent.setup();
    comfyUiMocks.inspectViviCompatSupport.mockResolvedValue({
      supported: false,
      hasDecomposeNode: false,
      hasExportNode: false,
      capability: null,
      pluginVersion: null,
      manifestSchema: null,
      issues: ["Missing node: ViviSeeThroughDecompose"],
    });
    comfyUiMocks.generateFromPromptToPsd.mockResolvedValue(new ArrayBuffer(16));
    comfyUiMocks.loadPsdFromBufferAsync.mockResolvedValue(false);

    render(<AIGenerateDialog onClose={onClose} />);
    await waitFor(() => {
      expect(
        screen.getByText(/falling back to the legacy see-through workflow/i),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /from prompt/i }));
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(comfyUiMocks.generateFromPromptToPsd).toHaveBeenCalledOnce();
    });

    expect(comfyUiMocks.invokeProvider).not.toHaveBeenCalled();
    expect(useComfyUIStore.getState().error).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(useComfyUIStore.getState().generating).toBe(false);
  });

  it("shows the thrown error message for prompt generation failures", async () => {
    const user = userEvent.setup();
    comfyUiMocks.invokeProvider.mockRejectedValue(new Error("backend offline"));

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /from prompt/i }));
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(screen.getByText(/Error:/i)).toHaveTextContent(/backend offline/i);
    });

    expect(comfyUiMocks.generateFromPromptToPsd).not.toHaveBeenCalled();
    expect(comfyUiMocks.loadPsdFromBufferAsync).not.toHaveBeenCalled();
    expect(comfyUiMocks.loadSeeThroughNativeImportBundleAsync).not.toHaveBeenCalled();
    expect(useComfyUIStore.getState().generating).toBe(false);
  });

  it("falls back at runtime when the compat workflow becomes unavailable", async () => {
    const user = userEvent.setup();
    const psdBuffer = new ArrayBuffer(12);

    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.openImageFile.mockResolvedValue("C:/tmp/input.png");
    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.readImageFile.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
    });
    comfyUiMocks.invokeProvider.mockRejectedValueOnce(
      new Error("Vivi2D compat plugin is unavailable: plugin version mismatch"),
    );
    comfyUiMocks.decomposeImageToPsd.mockResolvedValue(psdBuffer);
    comfyUiMocks.loadPsdFromBufferAsync.mockResolvedValue(true);

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(comfyUiMocks.invokeProvider).toHaveBeenCalledOnce();
      expect(comfyUiMocks.decomposeImageToPsd).toHaveBeenCalledOnce();
    });

    expect(useComfyUIStore.getState().compatStatus).toBe("missing");
    expect(
      useNotificationStore
        .getState()
        .notifications.some(
          (notification) =>
            notification.type === "warning" &&
            /compat workflow became unavailable/i.test(notification.message),
        ),
    ).toBe(true);
  });

  it("falls back to the legacy prompt workflow when the provider prompt capability becomes unavailable", async () => {
    const user = userEvent.setup();
    const psdBuffer = new ArrayBuffer(18);

    comfyUiMocks.invokeProvider.mockRejectedValueOnce(
      new Error("Vivi2D compat plugin is unavailable: prompt node mismatch"),
    );
    comfyUiMocks.generateFromPromptToPsd.mockResolvedValue(psdBuffer);
    comfyUiMocks.loadPsdFromBufferAsync.mockResolvedValue(true);

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /from prompt/i }));
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(comfyUiMocks.invokeProvider).toHaveBeenCalledOnce();
      expect(comfyUiMocks.generateFromPromptToPsd).toHaveBeenCalledOnce();
      expect(comfyUiMocks.loadPsdFromBufferAsync).toHaveBeenCalledWith(
        psdBuffer,
        "see-through.psd",
        undefined,
      );
    });

    expect(useComfyUIStore.getState().compatStatus).toBe("missing");
  });

  it("falls back to compat PSD export when native import fails after bundle download", async () => {
    const user = userEvent.setup();
    const psdBuffer = new ArrayBuffer(20);
    const nativeBundle = {
      manifestPath: "vivi2d/decompose/job/manifest.json",
      manifest: makeManifest(),
      layerAssets: [
        {
          image_path: "layers/layer_000.png",
          imageData: new ArrayBuffer(8),
        },
      ],
    };

    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.openImageFile.mockResolvedValue("C:/tmp/input.png");
    (
      window as typeof window & { electronAPI: any }
    ).electronAPI.readImageFile.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
    });
    comfyUiMocks.invokeProvider
      .mockResolvedValueOnce(providerResultFromBundle(nativeBundle))
      .mockResolvedValueOnce(providerPsdResult(psdBuffer));
    comfyUiMocks.loadSeeThroughNativeImportBundleAsync.mockResolvedValue(false);
    comfyUiMocks.loadPsdFromBufferAsync.mockResolvedValue(true);

    render(<AIGenerateDialog onClose={onClose} />);
    await user.click(getPrimaryAction());

    await waitFor(() => {
      expect(comfyUiMocks.invokeProvider).toHaveBeenCalledTimes(2);
      expect(comfyUiMocks.invokeProvider.mock.calls[1]?.[1]).toMatchObject({
        capabilityId: "vivi2d.provider.manifestToPsd.v1",
        parameters: { manifestPath: "vivi2d/decompose/job/manifest.json" },
      });
      expect(comfyUiMocks.loadPsdFromBufferAsync).toHaveBeenCalledWith(
        psdBuffer,
        "see-through.psd",
        {
          mode: "seeThrough",
          manifest: nativeBundle.manifest,
        },
      );
    });

    expect(
      useNotificationStore
        .getState()
        .notifications.some(
          (notification) =>
            notification.type === "warning" &&
            /native see-through import path failed/i.test(notification.message),
        ),
    ).toBe(true);
  });
});
