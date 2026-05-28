import { useEffect, useState } from "react";
import { FaceTracker } from "../tracking/face-tracker";

export function useCamerasList(): {
  cameras: MediaDeviceInfo[];
  error: Error | null;
} {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    FaceTracker.listCameras()
      .then((list) => {
        if (!cancelled) setCameras(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { cameras, error };
}
