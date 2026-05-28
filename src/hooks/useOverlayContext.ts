import type { LayerId, ProjectData } from "@vivi2d/core/types";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "@/stores/editorStore";
import { type Notification, useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";

export type NotifyFn = (type: Notification["type"], message: string) => void;

export interface OverlayContext {
  project: ProjectData | null;
  selectedLayerId: LayerId | null;
  selectedLayerIds: LayerId[];
  zoom: number;
  panX: number;
  panY: number;

  notify: NotifyFn;
}

const notify: NotifyFn = (type, message) => {
  useNotificationStore.getState().addNotification(type, message);
};

export function useOverlayContext(): OverlayContext {
  const { project } = useEditorStore(useShallow((s) => ({ project: s.project })));
  const { selectedLayerId, selectedLayerIds } = useSelectionStore(
    useShallow((s) => ({
      selectedLayerId: s.selectedLayerId,
      selectedLayerIds: s.selectedLayerIds,
    })),
  );
  const { zoom, panX, panY } = useViewportStore(
    useShallow((s) => ({
      zoom: s.zoom,
      panX: s.panX,
      panY: s.panY,
    })),
  );

  return {
    project,
    selectedLayerId,
    selectedLayerIds,
    zoom,
    panX,
    panY,
    notify,
  };
}
