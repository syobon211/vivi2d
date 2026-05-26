import type { ViviSeeThroughManifest } from "@vivi2d/provider-comfyui";
import type { ProjectData } from "@vivi2d/core/types";
import { cancelE2EPerfProbe, startE2EPerfProbe } from "@/lib/e2e-perf-probe";
import { t as tGlobal } from "@/lib/i18n";
import { parsePsd } from "@/lib/psd-loader";
import { parsePsdAsync } from "@/lib/workers/psd-parse-client";
import { useNotificationStore } from "../notificationStore";
import { applyLoadedProject } from "./reset";
import { applySeeThroughImportContext } from "./seeThroughImport";

let activePsdLoadController: AbortController | null = null;

function beginPsdLoad(): AbortController {
  activePsdLoadController?.abort();
  const controller = new AbortController();
  activePsdLoadController = controller;
  return controller;
}

function finishPsdLoad(controller: AbortController): boolean {
  if (activePsdLoadController !== controller) return false;
  activePsdLoadController = null;
  return true;
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

const CANVAS_OPEN_PROBE_KEY = "psd-import";

function startCanvasOpenProbes(): void {
  startE2EPerfProbe("canvasOpen.projectReady", CANVAS_OPEN_PROBE_KEY);
  startE2EPerfProbe("canvasOpen.layerListReady", CANVAS_OPEN_PROBE_KEY);
  startE2EPerfProbe("canvasOpen.editableCanvasReady", CANVAS_OPEN_PROBE_KEY);
}

function cancelCanvasOpenProbes(): void {
  cancelE2EPerfProbe("canvasOpen.projectReady", CANVAS_OPEN_PROBE_KEY);
  cancelE2EPerfProbe("canvasOpen.layerListReady", CANVAS_OPEN_PROBE_KEY);
  cancelE2EPerfProbe("canvasOpen.editableCanvasReady", CANVAS_OPEN_PROBE_KEY);
}

export type LoadPsdOptions =
  | { mode?: "default" }
  | {
      mode: "seeThrough";
      manifest: ViviSeeThroughManifest;
    };

function applyImportOptions(project: ProjectData, options?: LoadPsdOptions): ProjectData {
  if (!options || options.mode !== "seeThrough") {
    return project;
  }

  const result = applySeeThroughImportContext(project, options.manifest);
  if (result.warning) {
    useNotificationStore.getState().addNotification("warning", result.warning);
  }
  return result.project;
}

export async function loadPsd(): Promise<boolean> {
  const controller = beginPsdLoad();
  try {
    const result = await window.electronAPI.openPsdFile();
    if (!result) return false;
    if (controller.signal.aborted) return false;
    startCanvasOpenProbes();

    let parsed: Awaited<ReturnType<typeof parsePsdAsync>>;
    try {
      parsed = await parsePsdAsync(result.buffer, result.fileName, {
        signal: controller.signal,
      });
    } catch (e) {
      cancelCanvasOpenProbes();
      if (isAbortError(e)) return false;
      useNotificationStore
        .getState()
        .addNotification("error", e instanceof Error ? e.message : String(e));
      return false;
    }

    if (!finishPsdLoad(controller)) {
      cancelCanvasOpenProbes();
      return false;
    }
    parsed.commitTextures();
    applyLoadedProject(parsed.project, null, "psd");
    return true;
  } catch (e) {
    cancelCanvasOpenProbes();
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        e instanceof Error
          ? `${tGlobal("notify.psdLoadFailed")}: ${e.message}`
          : tGlobal("notify.psdLoadFailed"),
      );
    return false;
  }
}

export function loadPsdFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  options?: LoadPsdOptions,
): boolean {
  startCanvasOpenProbes();
  let project: ProjectData;
  try {
    project = parsePsd(buffer, fileName);
  } catch (e) {
    cancelCanvasOpenProbes();
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  project = applyImportOptions(project, options);
  applyLoadedProject(
    project,
    null,
    options?.mode === "seeThrough" ? "seeThrough" : "psd",
  );
  return true;
}

export async function loadPsdFromBufferAsync(
  buffer: ArrayBuffer,
  fileName: string,
  options?: LoadPsdOptions,
): Promise<boolean> {
  const controller = beginPsdLoad();
  startCanvasOpenProbes();
  let parsed: Awaited<ReturnType<typeof parsePsdAsync>>;
  try {
    parsed = await parsePsdAsync(buffer, fileName, {
      signal: controller.signal,
    });
  } catch (e) {
    cancelCanvasOpenProbes();
    if (isAbortError(e)) return false;
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  if (!finishPsdLoad(controller)) {
    cancelCanvasOpenProbes();
    return false;
  }
  parsed.commitTextures();
  const project = applyImportOptions(parsed.project, options);
  applyLoadedProject(
    project,
    null,
    options?.mode === "seeThrough" ? "seeThrough" : "psd",
  );
  return true;
}
