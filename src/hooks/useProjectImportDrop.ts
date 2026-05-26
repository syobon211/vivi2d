import { useEffect } from "react";
import { DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS } from "@/lib/manual-image-import-options";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import {
  importImageAsLayerFromBufferAsync,
  importImagesAsLayersFromBuffersAsync,
  loadImageFromBufferAsync,
  loadPsdFromBufferAsync,
} from "@/stores/projectIO";

type NamedImageBuffer = {
  buffer: ArrayBuffer;
  fileName: string;
};

const PNG_ONLY_WARNING = "Manual image import currently supports PNG files only.";
const MIXED_DROP_WARNING = "Drop either a single PSD file or PNG files, not a mixture.";
const MULTI_PNG_NO_PROJECT_WARNING =
  "Open a project first before dropping multiple PNG layers.";
const MULTI_PSD_WARNING = "Drop a single PSD file at a time.";

function getLowerCaseExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

function warn(message: string) {
  useNotificationStore.getState().addNotification("warning", message);
}

async function readNamedBuffers(files: File[]): Promise<NamedImageBuffer[]> {
  return await Promise.all(
    files.map(async (file) => ({
      buffer: await file.arrayBuffer(),
      fileName: file.name,
    })),
  );
}

export function useProjectImportDrop() {
  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) return;

      const psdFiles = droppedFiles.filter(
        (file) => getLowerCaseExtension(file.name) === ".psd",
      );
      const pngFiles = droppedFiles.filter(
        (file) => getLowerCaseExtension(file.name) === ".png",
      );
      const unsupportedFiles = droppedFiles.filter((file) => {
        const extension = getLowerCaseExtension(file.name);
        return extension !== ".psd" && extension !== ".png";
      });

      if (unsupportedFiles.length > 0) {
        warn(PNG_ONLY_WARNING);
        return;
      }

      if (psdFiles.length > 0 && pngFiles.length > 0) {
        warn(MIXED_DROP_WARNING);
        return;
      }

      if (psdFiles.length > 1) {
        warn(MULTI_PSD_WARNING);
        return;
      }

      if (psdFiles.length === 1) {
        const file = psdFiles[0]!;
        const buffer = await file.arrayBuffer();
        await loadPsdFromBufferAsync(buffer, file.name);
        return;
      }

      if (pngFiles.length === 0) {
        return;
      }

      const project = useEditorStore.getState().project;
      if (!project) {
        if (pngFiles.length > 1) {
          warn(MULTI_PNG_NO_PROJECT_WARNING);
          return;
        }
        const file = pngFiles[0]!;
        const buffer = await file.arrayBuffer();
        await loadImageFromBufferAsync(
          buffer,
          file.name,
          DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
        );
        return;
      }

      if (pngFiles.length === 1) {
        const file = pngFiles[0]!;
        const buffer = await file.arrayBuffer();
        await importImageAsLayerFromBufferAsync(
          buffer,
          file.name,
          DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
        );
        return;
      }

      const files = await readNamedBuffers(pngFiles);
      await importImagesAsLayersFromBuffersAsync(
        files,
        DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
      );
    };

    const onDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, []);
}
