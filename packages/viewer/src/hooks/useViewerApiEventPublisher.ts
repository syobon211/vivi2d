import { useCallback, useEffect, useRef } from "react";
import type { ViewerApiPublicEvent } from "../api/viewer-api-event-mapper";

const MAX_PENDING_VIEWER_API_EVENTS = 512;
const MAX_VIEWER_API_EVENT_BATCH = 128;

export function useViewerApiEventPublisher() {
  const pendingEventsRef = useRef<ViewerApiPublicEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const scheduledWithTimeoutRef = useRef(false);

  const publishViewerApiEvents = useCallback((events: ViewerApiPublicEvent[]) => {
    if (events.length > 0) pendingEventsRef.current.push(...events);
    if (pendingEventsRef.current.length > MAX_PENDING_VIEWER_API_EVENTS) {
      pendingEventsRef.current.splice(
        0,
        pendingEventsRef.current.length - MAX_PENDING_VIEWER_API_EVENTS,
      );
    }
    if (pendingEventsRef.current.length === 0) return;
    if (frameRef.current !== null) return;

    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : (callback: FrameRequestCallback) => {
            scheduledWithTimeoutRef.current = true;
            return window.setTimeout(callback, 16);
          };

    frameRef.current = schedule(() => {
      frameRef.current = null;
      scheduledWithTimeoutRef.current = false;
      const batch = pendingEventsRef.current.splice(0, MAX_VIEWER_API_EVENT_BATCH);
      for (const publicEvent of batch) {
        void window.viviAPI?.viewerApi?.publishEvent?.(publicEvent);
      }
      if (pendingEventsRef.current.length > 0) {
        publishViewerApiEvents([]);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current === null) return;
      if (scheduledWithTimeoutRef.current) {
        window.clearTimeout(frameRef.current);
      } else if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      pendingEventsRef.current = [];
    };
  }, []);

  return publishViewerApiEvents;
}
