import { useCallback, useState } from "react";
import type { ViewerPropTransformPatch } from "../actions/action-runner";
import type { ViviViewerController } from "../controller/viewer-controller";
import { createPropFromFile } from "./prop-loader";
import type { ViviProp } from "./prop-types";

interface ViewerOverlayActionsOptions {
  viewerController: ViviViewerController;
  viewerProps: ViviProp[];
  showToast: (message: string) => void;
}

export function useViewerOverlayActions({
  viewerController,
  viewerProps,
  showToast,
}: ViewerOverlayActionsOptions) {
  const [error, setError] = useState<string | null>(null);

  const handleAddFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const prop = await createPropFromFile(file);
        const result = await viewerController.dispatch({
          type: "props.add",
          prop,
          scopes: ["write:props"],
        });
        if (!result.accepted) {
          throw new Error(result.reason ?? "overlay add failed");
        }
        showToast(`Overlay added: ${prop.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Overlay add failed";
        setError(message);
      }
    },
    [showToast, viewerController],
  );

  const handleCreateApiAsset = useCallback(async (file: File, grantId: string) => {
    if (!window.viviAPI?.viewerApi?.createPropAsset) {
      throw new Error("Viewer API bridge is unavailable");
    }
    const bytesBase64 = await fileToBase64(file);
    return window.viviAPI.viewerApi.createPropAsset({
      grantId,
      displayName: file.name,
      mimeType: file.type || guessImageMimeType(file.name),
      bytesBase64,
    });
  }, []);

  const handleListApiAssets = useCallback(async (grantId: string) => {
    return window.viviAPI?.viewerApi?.listPropAssets?.({ grantId }) ?? [];
  }, []);

  const handleExtendApiAsset = useCallback(
    async (grantId: string, assetId: string) => {
      return window.viviAPI?.viewerApi?.extendPropAsset?.({ grantId, assetId });
    },
    [],
  );

  const handleRevokeApiAsset = useCallback(
    async (grantId: string, assetId: string) => {
      return window.viviAPI?.viewerApi?.revokePropAsset?.({ grantId, assetId });
    },
    [],
  );

  const handleUpdateProp = useCallback(
    async (prop: ViviProp) => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.update",
        prop,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay update failed");
      }
    },
    [viewerController],
  );

  const handleDuplicateProp = useCallback(
    async (propId: string) => {
      const source = viewerProps.find((prop) => prop.id === propId);
      if (!source) {
        setError("Overlay not found");
        return;
      }
      setError(null);
      const copy: ViviProp = {
        ...source,
        id: makeOverlayCopyId(source.id),
        name: `${source.name} Copy`,
        visible: true,
        drawOrder: source.drawOrder + 1,
        transform: {
          ...source.transform,
          x: source.transform.x + 24,
          y: source.transform.y + 24,
        },
      };
      const result = await viewerController.dispatch({
        type: "props.add",
        prop: copy,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay duplicate failed");
      }
    },
    [viewerController, viewerProps],
  );

  const handleRemoveProp = useCallback(
    async (propId: string) => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.remove",
        propId,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay remove failed");
      }
    },
    [viewerController],
  );

  const handlePatchTransform = useCallback(
    async (propId: string, transform: ViewerPropTransformPatch) => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.patchTransform",
        propId,
        transform,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay transform failed");
      }
    },
    [viewerController],
  );

  const handleSetVisible = useCallback(
    async (propId: string, visible: boolean) => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.setVisible",
        propId,
        visible,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay visibility failed");
      }
    },
    [viewerController],
  );

  const handleCycleGroup = useCallback(
    async (groupId: string, direction: "next" | "previous") => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.cycleGroup",
        groupId,
        direction,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay group cycle failed");
      }
    },
    [viewerController],
  );

  const handleSpawnBurst = useCallback(
    async (propIds: string[]) => {
      setError(null);
      const result = await viewerController.dispatch({
        type: "props.spawnBurst",
        propIds,
        scopes: ["write:props"],
      });
      if (!result.accepted) {
        setError(result.reason ?? "Overlay burst failed");
      }
    },
    [viewerController],
  );

  return {
    error,
    handleAddFile,
    handleCreateApiAsset,
    handleListApiAssets,
    handleExtendApiAsset,
    handleRevokeApiAsset,
    handleDuplicateProp,
    handleRemoveProp,
    handlePatchTransform,
    handleSetVisible,
    handleUpdateProp,
    handleCycleGroup,
    handleSpawnBurst,
  };
}

function makeOverlayCopyId(sourceId: string): string {
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${sourceId.slice(0, 96)}-copy-${randomId}`.slice(0, 256);
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function guessImageMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}
