import { useCallback, useEffect } from "react";
import {
  isViewerApiRendererRequestPayload,
  resolveViewerApiRendererRequest,
  type ViewerApiRendererRequestPayload,
} from "../api/viewer-api-renderer-requests";
import type { ViviViewerController } from "../controller/viewer-controller";

export function useViewerApiRendererBridge(
  viewerController: ViviViewerController,
): void {
  const handleViewerApiRendererRequest = useCallback(
    async (payload: ViewerApiRendererRequestPayload) => {
      const respond = window.viviAPI?.viewerApi?.respondRendererRequest;
      if (!respond) return;
      try {
        const response = await resolveViewerApiRendererRequest(payload, {
          snapshot: () => viewerController.snapshot(),
          dispatch: (command) => viewerController.dispatch(command),
        });
        await respond({
          requestId: payload.requestId,
          ...response,
        });
      } catch (error) {
        await respond({
          requestId: payload.requestId,
          ok: false,
          data: {},
          reason:
            error instanceof Error ? error.message : "renderer request failed",
        });
      }
    },
    [viewerController],
  );

  useEffect(() => {
    return window.viviAPI?.viewerApi?.onRendererRequest?.((payload) => {
      if (isViewerApiRendererRequestPayload(payload)) {
        void handleViewerApiRendererRequest(payload);
      }
    });
  }, [handleViewerApiRendererRequest]);
}
