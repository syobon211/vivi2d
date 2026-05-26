import { findLayerById } from "@vivi2d/core/layer-utils";
import { isViviMesh, type ProjectData } from "@vivi2d/core/types";
import type { ReferenceOverlaySettings } from "@/stores/viewportStore";

export function buildDepthInspectorReferenceOverlaySettings(
  project: ProjectData | null | undefined,
  selectedLayerId: string | null | undefined,
): Partial<ReferenceOverlaySettings> | null {
  if (!project || !selectedLayerId) return null;
  const layer = findLayerById(project.layers, selectedLayerId);
  if (!layer || !isViviMesh(layer)) return null;
  const metadata = layer.importMetadata;
  if (!metadata || metadata.source !== "seeThrough") return null;
  const [x, y, width, height] = metadata.seeThrough.bbox;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    enabled: true,
    mode: "importedBounds",
  };
}
