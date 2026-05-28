export {};
declare global {
  interface Window {
    viviAPI?: {
      setBackgroundMode: (mode: string) => Promise<unknown>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      toggleFrame: () => Promise<unknown>;
      setWindowSize: (width: number, height: number) => Promise<unknown>;
      onBackgroundModeChanged: (callback: (mode: string) => void) => () => void;
      viewerApi?: {
        getStatus: () => Promise<unknown>;
        setEnabled: (payload: { enabled: boolean; port?: number }) => Promise<unknown>;
        openPairingWindow: (payload: {
          durationMs?: number;
          origins?: string[];
        }) => Promise<unknown>;
        closePairingWindow: () => Promise<unknown>;
        listGrants: () => Promise<unknown>;
        approvePairing: (payload: {
          challengeId: string;
          code: string;
        }) => Promise<unknown>;
        revokeGrant: (payload: { grantId: string }) => Promise<boolean>;
        rotateGrant: (payload: { grantId: string }) => Promise<unknown>;
        publishEvent: (payload: {
          name: string;
          data: Record<string, unknown>;
          timestamp?: number;
        }) => Promise<number>;
        respondRendererRequest: (payload: {
          requestId: string;
          ok: boolean;
          data: Record<string, unknown>;
          reason?: string;
        }) => Promise<boolean>;
        createPropAsset: (payload: {
          grantId: string;
          displayName?: string;
          mimeType: string;
          bytesBase64: string;
          ttlMs?: number;
        }) => Promise<unknown>;
        listPropAssets: (payload: { grantId: string }) => Promise<unknown>;
        extendPropAsset: (payload: {
          grantId: string;
          assetId: string;
        }) => Promise<unknown>;
        revokePropAsset: (payload: {
          grantId: string;
          assetId: string;
        }) => Promise<boolean>;
        onStatusChanged: (callback: (status: unknown) => void) => () => void;
        onAssetStatusChanged: (
          callback: (payload: unknown) => void,
        ) => () => void;
        onRendererRequest: (
          callback: (payload: {
            requestId: string;
            type: string;
            data: Record<string, unknown>;
            scopes: string[];
          }) => void,
        ) => () => void;
      };
    };
  }
}
