import { useCallback, useEffect, useRef, useState } from "react";
import { UI_TIMING } from "../constants";

export function useHitIndicator(): {
  lastHit: string | null;
  showHit: (text: string) => void;
} {
  const [lastHit, setLastHit] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showHit = useCallback((text: string) => {
    setLastHit(text);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setLastHit(null);
      timeoutRef.current = null;
    }, UI_TIMING.HIT_DISPLAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return { lastHit, showHit };
}
