import { isScreenColorDefault } from "@vivi2d/core/color-utils";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ProjectData, RGBColor } from "@vivi2d/core/types";
import type { LayerSyncScreenColorSupport } from "@vivi2d/renderer-pixi/editor-layer-sync";
import type { Filter } from "pixi.js";
import { useEffect, useMemo, useState } from "react";

let screenColorSupportPromise: Promise<LayerSyncScreenColorSupport> | null = null;

function loadScreenColorSupport(): Promise<LayerSyncScreenColorSupport> {
  if (!screenColorSupportPromise) {
    screenColorSupportPromise = import("@vivi2d/renderer-pixi/screen-color-filter").then(
      (module) => ({
        createFilter: (color: RGBColor): Filter => module.createScreenColorFilter(color),
        updateFilter: (filter: Filter, color: RGBColor): void =>
          module.updateScreenColorFilter(filter, color),
      }),
    );
  }
  return screenColorSupportPromise;
}

export function projectNeedsScreenColorSupport(
  project: ProjectData | null | undefined,
): boolean {
  if (!project) return false;
  return flattenLayers(project.layers).some(
    (layer) => layer.kind === "viviMesh" && !isScreenColorDefault(layer.screenColor),
  );
}

export function useScreenColorSupport(
  project: ProjectData | null | undefined,
): LayerSyncScreenColorSupport | null {
  const [support, setSupport] = useState<LayerSyncScreenColorSupport | null>(null);
  const needsSupport = useMemo(() => projectNeedsScreenColorSupport(project), [project]);

  useEffect(() => {
    if (!needsSupport || support) return;

    let cancelled = false;
    loadScreenColorSupport().then((loaded) => {
      if (!cancelled) {
        setSupport(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [needsSupport, support]);

  return support;
}
