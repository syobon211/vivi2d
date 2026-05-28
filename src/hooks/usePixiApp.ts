import { PIXI_CONFIG, THEME_BG_COLORS } from "@vivi2d/core/constants";
import {
  destroyEditorPixiApp,
  type EditorPixiRefs,
  EMPTY_EDITOR_PIXI_REFS,
  initEditorPixiApp,
} from "@vivi2d/renderer-pixi/editor-app";
import { useEffect, useRef } from "react";
import { shouldEnableE2ECanvasReadback } from "@/lib/e2e-canvas-readback";
import { useThemeStore } from "@/stores/themeStore";

export type PixiAppRefs = EditorPixiRefs;

function createEmptyPixiAppRefs(): PixiAppRefs {
  return { ...EMPTY_EDITOR_PIXI_REFS };
}

let globalPixiRefs: PixiAppRefs | null = null;

export function getPixiAppRefs(): PixiAppRefs | null {
  return globalPixiRefs;
}

export function usePixiApp(containerRef: React.RefObject<HTMLDivElement | null>) {
  const refs = useRef<PixiAppRefs>(createEmptyPixiAppRefs());
  const preserveDrawingBuffer = shouldEnableE2ECanvasReadback();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    const initBg =
      THEME_BG_COLORS[useThemeStore.getState().theme] ?? PIXI_CONFIG.BG_COLOR;

    initEditorPixiApp({
      container: el,
      backgroundColor: initBg,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preserveDrawingBuffer,
      worldLabel: "world",
      backgroundLabel: "canvas-bg",
      overlayLabel: "overlay",
    }).then((nextRefs) => {
      if (disposed) {
        destroyEditorPixiApp(nextRefs);
        return;
      }

      el.appendChild(nextRefs.app!.canvas);
      refs.current = nextRefs;
      globalPixiRefs = nextRefs;
    });

    const observer = new ResizeObserver(() => {
      refs.current.app?.resize();
    });
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      destroyEditorPixiApp(refs.current);
      refs.current = createEmptyPixiAppRefs();
      globalPixiRefs = null;
    };
  }, [containerRef, preserveDrawingBuffer]);

  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const app = refs.current.app;
    if (!app) return;
    app.renderer.background.color = THEME_BG_COLORS[theme] ?? PIXI_CONFIG.BG_COLOR;
  }, [theme]);

  return refs;
}
