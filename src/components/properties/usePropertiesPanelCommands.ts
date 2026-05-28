import type { BlendMode, LayerId, LayerSemanticRole, RGBColor } from "@vivi2d/core/types";
import type { MeshDensityPreset } from "@vivi2d/core/constants";
import { useCallback } from "react";
import { buildDepthInspectorReferenceOverlaySettings } from "@/lib/depth-inspector-reference-overlay";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

export function usePropertiesPanelCommands() {
  const setLayerOpacity = useEditorStore((s) => s.setLayerOpacity);
  const setDrawOrder = useEditorStore((s) => s.setDrawOrder);
  const setBlendMode = useEditorStore((s) => s.setBlendMode);
  const setMultiplyColor = useEditorStore((s) => s.setMultiplyColor);
  const setScreenColor = useEditorStore((s) => s.setScreenColor);
  const setCulling = useEditorStore((s) => s.setCulling);
  const setClipMaskIds = useEditorStore((s) => s.setClipMaskIds);
  const setAutoMeshBatch = useEditorStore((s) => s.setAutoMeshBatch);
  const setLayerSemanticRole = useEditorStore((s) => s.setLayerSemanticRole);
  const setLayerSemanticRoleBatch = useEditorStore(
    (s) => s.setLayerSemanticRoleBatch,
  );
  const openDepthInspectorDialog = useProjectDialogsStore(
    (s) => s.openDepthInspector,
  );

  const openDepthInspector = useCallback(() => {
    const currentProject = useEditorStore.getState().project;
    const currentSelectedLayerId = useSelectionStore.getState().selectedLayerId;
    const overlaySettings = buildDepthInspectorReferenceOverlaySettings(
      currentProject,
      currentSelectedLayerId,
    );
    if (overlaySettings) {
      useViewportStore.getState().setReferenceOverlaySettings(overlaySettings);
    }
    openDepthInspectorDialog();
  }, [openDepthInspectorDialog]);

  return {
    openDepthInspector,
    setAutoMeshBatch,
    setBlendMode: (id: LayerId, blendMode: BlendMode) =>
      setBlendMode(id, blendMode),
    setClipMaskIds: (id: LayerId, maskIds: LayerId[]) =>
      setClipMaskIds(id, maskIds),
    setCulling: (id: LayerId, culling: boolean) => setCulling(id, culling),
    setDrawOrder: (id: LayerId, drawOrder: number) =>
      setDrawOrder(id, drawOrder),
    setLayerOpacity: (id: LayerId, opacity: number) =>
      setLayerOpacity(id, opacity),
    setLayerSemanticRole: (id: LayerId, role?: LayerSemanticRole) =>
      setLayerSemanticRole(id, role),
    setLayerSemanticRoleBatch: (
      layerIds: LayerId[],
      role?: LayerSemanticRole,
    ) => setLayerSemanticRoleBatch(layerIds, role),
    setMultiplyColor: (id: LayerId, color: RGBColor) =>
      setMultiplyColor(id, color),
    setScreenColor: (id: LayerId, color: RGBColor) => setScreenColor(id, color),
  };
}

export type PropertiesPanelCommands = ReturnType<typeof usePropertiesPanelCommands>;
