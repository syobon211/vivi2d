import type { EditorOverlayGraphics } from "@vivi2d/renderer-pixi";
import { createOverlayGraphics, destroyOverlayGraphics } from "@vivi2d/renderer-pixi/editor-app";
import { useEffect, useRef } from "react";
import type { PixiAppRefs } from "./usePixiApp";

export function useOverlayGraphics(
  pixiRefs: React.RefObject<PixiAppRefs>,
  label: string,
  enabled = true,
): React.RefObject<EditorOverlayGraphics | null> {
  const graphics = useRef<EditorOverlayGraphics | null>(null);

  useEffect(() => {
    const overlay = pixiRefs.current.overlay;
    if (!enabled || !overlay) {
      if (graphics.current) {
        destroyOverlayGraphics(overlay, graphics.current);
        graphics.current = null;
      }
      return;
    }

    if (graphics.current) {
      destroyOverlayGraphics(overlay, graphics.current);
      graphics.current = null;
    }

    const g = createOverlayGraphics(overlay, label);
    if (!g) return;

    graphics.current = g;

    return () => {
      destroyOverlayGraphics(overlay, g);
      if (graphics.current === g) {
        graphics.current = null;
      }
    };
  }, [enabled, pixiRefs, label]);

  return graphics;
}
