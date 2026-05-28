import { useCallback, useEffect, useState } from "react";
import {
  parseViewerApiStatus,
} from "../api/viewer-api-status";
import type { ViewerApiStatus } from "../api/viewer-api-client-types";

const EMPTY_STATUS: ViewerApiStatus = { enabled: false };
const BRIDGE_UNAVAILABLE_MESSAGE =
  "Viewer API bridge is only available in the Electron viewer.";

type ViewerApiBridge = NonNullable<NonNullable<Window["viviAPI"]>["viewerApi"]>;

export function useViewerApiStatus() {
  const [status, setStatus] = useState<ViewerApiStatus>(EMPTY_STATUS);
  const [available, setAvailable] = useState(() =>
    Boolean(window.viviAPI?.viewerApi),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.viviAPI?.viewerApi;
    setAvailable(Boolean(api));
    if (!api) {
      setStatus(EMPTY_STATUS);
      return EMPTY_STATUS;
    }
    const next = parseViewerApiStatus(await api.getStatus());
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.viviAPI?.viewerApi?.onStatusChanged?.((payload) => {
      setAvailable(true);
      setStatus(parseViewerApiStatus(payload));
    });
    if (unsubscribe) return unsubscribe;

    const id = window.setInterval(() => {
      void refresh();
    }, 2_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const run = useCallback(
    async <T,>(task: (api: ViewerApiBridge) => Promise<T>): Promise<T | null> => {
      const api = window.viviAPI?.viewerApi;
      setAvailable(Boolean(api));
      if (!api) {
        setStatus(EMPTY_STATUS);
        setError(BRIDGE_UNAVAILABLE_MESSAGE);
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await task(api);
        await refresh();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const setEnabled = useCallback(
    (enabled: boolean, port?: number) =>
      run(async (api) => {
        await api.setEnabled({ enabled, port });
      }),
    [run],
  );

  const openPairingWindow = useCallback(
    (origins: string[] = []) =>
      run(async (api) => {
        await api.openPairingWindow({
          durationMs: 90_000,
          origins,
        });
      }),
    [run],
  );

  const closePairingWindow = useCallback(
    () =>
      run(async (api) => {
        await api.closePairingWindow();
      }),
    [run],
  );

  const approvePairing = useCallback(
    (challengeId: string, code: string) =>
      run(async (api) => {
        await api.approvePairing({ challengeId, code });
      }),
    [run],
  );

  const revokeGrant = useCallback(
    (grantId: string) =>
      run(async (api) => {
        await api.revokeGrant({ grantId });
      }),
    [run],
  );

  const rotateGrant = useCallback(
    (grantId: string) =>
      run(async (api) => {
        await api.rotateGrant({ grantId });
      }),
    [run],
  );

  return {
    status,
    available,
    busy,
    error,
    refresh,
    setEnabled,
    openPairingWindow,
    closePairingWindow,
    approvePairing,
    revokeGrant,
    rotateGrant,
  };
}
