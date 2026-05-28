import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { resetRelatedStores } from "./reset";

export type { ManualImageImportOptions } from "./image";
export {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  importImageAsLayer,
  importImageAsLayerFromBufferAsync,
  importImagesAsLayers,
  importImagesAsLayersFromBuffersAsync,
  importPngFolderAsLayers,
  loadImage,
  loadImageFromBufferAsync,
  normalizeManualImageImportOptions,
  reimportManualPngLayer,
} from "./image";
export { loadPsd, loadPsdFromBuffer, loadPsdFromBufferAsync } from "./psd";
export {
  applyResetPlan,
  buildResetPlan,
  initParameterValues,
  type ResetPlan,
  type ResetStep,
  resetRelatedStores,
} from "./reset";
export {
  loadSeeThroughNativeImportBundleAsync,
  parseSeeThroughNativeImportBundleAsync,
} from "./seeThroughNativeImport";
export { exportVividProject, importVividProject } from "./vivid";
export { loadProject, saveProject } from "./viviFile";

export function closeProject(): void {
  useEditorStore.setState((s) => {
    s.project = null;
    s.projectVersion = 0;
    s.projectStructureVersion = 0;
    s.currentFilePath = null;
    s.projectSourceKind = "none";
  });
  resetRelatedStores();
  clearTextures();
}
