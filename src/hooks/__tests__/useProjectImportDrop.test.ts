import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectImportDrop } from "@/hooks/useProjectImportDrop";
import { DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS } from "@/lib/manual-image-import-options";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

vi.mock("@/stores/projectIO", () => ({
  importImageAsLayerFromBufferAsync: vi.fn(),
  importImagesAsLayersFromBuffersAsync: vi.fn(),
  loadImageFromBufferAsync: vi.fn(),
  loadPsdFromBufferAsync: vi.fn(),
}));

const {
  importImageAsLayerFromBufferAsync,
  importImagesAsLayersFromBuffersAsync,
  loadImageFromBufferAsync,
  loadPsdFromBufferAsync,
} = await import("@/stores/projectIO");

function createDropEvent(files: File[]): DragEvent {
  const event = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: { files },
  });
  return event;
}

function createFile(fileName: string, content = new Uint8Array([1, 2, 3])): File {
  const file = new File([content], fileName, { type: "application/octet-stream" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () =>
      Promise.resolve(
        content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
      ),
  });
  return file;
}

describe("useProjectImportDrop", () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes a single PSD drop to the PSD loader", async () => {
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("character.psd")]));
      await Promise.resolve();
    });

    expect(loadPsdFromBufferAsync).toHaveBeenCalledOnce();
    expect(loadImageFromBufferAsync).not.toHaveBeenCalled();
    expect(importImageAsLayerFromBufferAsync).not.toHaveBeenCalled();
  });

  it("opens a single PNG as a new project when no project is active", async () => {
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("character.png")]));
      await Promise.resolve();
    });

    expect(loadImageFromBufferAsync).toHaveBeenCalledOnce();
    expect(loadImageFromBufferAsync).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "character.png",
      DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
    );
    expect(importImageAsLayerFromBufferAsync).not.toHaveBeenCalled();
  });

  it("imports a single PNG as a layer when a project is open", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("arm.png")]));
      await Promise.resolve();
    });

    expect(importImageAsLayerFromBufferAsync).toHaveBeenCalledOnce();
    expect(importImageAsLayerFromBufferAsync).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "arm.png",
      DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
    );
    expect(loadImageFromBufferAsync).not.toHaveBeenCalled();
  });

  it("imports multiple PNG files as layers in order when a project is open", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(
        createDropEvent([createFile("a.png"), createFile("b.png"), createFile("c.png")]),
      );
      await Promise.resolve();
    });

    expect(importImagesAsLayersFromBuffersAsync).toHaveBeenCalledWith(
      [
        expect.objectContaining({ fileName: "a.png" }),
        expect.objectContaining({ fileName: "b.png" }),
        expect.objectContaining({ fileName: "c.png" }),
      ],
      DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
    );
  });

  it("rejects mixed PSD and PNG drops with a warning", async () => {
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("a.psd"), createFile("b.png")]));
      await Promise.resolve();
    });

    expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe("warning");
    expect(loadPsdFromBufferAsync).not.toHaveBeenCalled();
    expect(importImagesAsLayersFromBuffersAsync).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types with a warning", async () => {
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("photo.jpg")]));
      await Promise.resolve();
    });

    expect(useNotificationStore.getState().notifications.at(-1)?.message).toContain(
      "PNG",
    );
    expect(loadImageFromBufferAsync).not.toHaveBeenCalled();
  });

  it("rejects multiple PNG drops without an open project", async () => {
    renderHook(() => useProjectImportDrop());

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("a.png"), createFile("b.png")]));
      await Promise.resolve();
    });

    expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe("warning");
    expect(importImagesAsLayersFromBuffersAsync).not.toHaveBeenCalled();
    expect(loadImageFromBufferAsync).not.toHaveBeenCalled();
  });

  it("prevents default on dragover", () => {
    renderHook(() => useProjectImportDrop());

    const event = new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
    });
    const spy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(spy).toHaveBeenCalled();
  });

  it("removes listeners on unmount", async () => {
    const { unmount } = renderHook(() => useProjectImportDrop());
    unmount();

    await act(async () => {
      window.dispatchEvent(createDropEvent([createFile("character.png")]));
      await Promise.resolve();
    });

    expect(loadImageFromBufferAsync).not.toHaveBeenCalled();
  });
});
