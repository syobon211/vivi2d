import { PIXI_CONFIG, THEME_BG_COLORS } from "@vivi2d/core/constants";
import {
  destroyEditorPixiApp,
  type EditorPixiRefs,
  EMPTY_EDITOR_PIXI_REFS,
  initEditorPixiApp,
} from "@vivi2d/renderer-pixi/editor-app";
import { type RenderOptions, UPDATE_PRIORITY } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { shouldEnableE2ECanvasReadback } from "@/lib/e2e-canvas-readback";
import { useThemeStore } from "@/stores/themeStore";

export type PixiAppRefs = EditorPixiRefs & {
  displayUnavailable?: boolean;
  renderSafely?: (options: RenderOptions) => void;
  markDisplayReady?: () => void;
  suspendDisplay?: () => void;
  retireDisplay?: () => void;
  disposeScene?: () => void;
};

function createEmptyPixiAppRefs(): PixiAppRefs {
  return { ...EMPTY_EDITOR_PIXI_REFS };
}

let globalPixiRefs: PixiAppRefs | null = null;

export function getPixiAppRefs(): PixiAppRefs | null {
  return globalPixiRefs;
}

export function usePixiApp(containerRef: React.RefObject<HTMLDivElement | null>) {
  const refs = useRef<PixiAppRefs>(createEmptyPixiAppRefs());
  const [generation, setGeneration] = useState(0);
  const [, setReady] = useState(0);
  const preserveDrawingBuffer = shouldEnableE2ECanvasReadback();

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation explicitly tears down a failed renderer before reinitialization.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let installed: PixiAppRefs | null = null;
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
    })
      .then((nextRefs) => {
        if (disposed) {
          destroyEditorPixiApp(nextRefs);
          return;
        }

        const app = nextRefs.app!;
        app.stop();
        app.ticker.remove(app.render, app);
        let hadReadyScene = false;
        const owned: PixiAppRefs = { ...nextRefs, displayUnavailable: false };
        owned.suspendDisplay = () => app.stop();
        owned.retireDisplay = () => {
          if (owned.displayUnavailable) return;
          owned.displayUnavailable = true;
          app.stop();
          if (hadReadyScene)
            queueMicrotask(() => {
              if (!disposed) setGeneration((value) => value + 1);
            });
        };
        owned.renderSafely = (options) => {
          if (disposed || owned.displayUnavailable)
            throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
          // Once this render entered and did not return, Pixi's private stacks may
          // be dirty. No subsequent draw/export is safe on this renderer instance.
          try {
            app.renderer.render(options);
          } catch {
            owned.retireDisplay!();
            throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
          }
        };
        owned.markDisplayReady = () => {
          if (disposed || owned.displayUnavailable) return;
          hadReadyScene = true;
          app.start();
        };
        app.ticker.add(
          () => {
            if (owned.displayUnavailable) return;
            try {
              owned.renderSafely!({ container: app.stage });
            } catch {
              /* The latch already stopped the ticker and scheduled recovery. */
            }
          },
          app,
          UPDATE_PRIORITY.LOW,
        );
        el.appendChild(app.canvas);
        installed = owned;
        refs.current = owned;
        globalPixiRefs = owned;
        setReady((value) => value + 1);
      })
      .catch(() => {
        // No raw backend details in notifications. A failed fresh initialization
        // stays unavailable; it is not an unbounded automatic recovery loop.
        if (!disposed) refs.current.displayUnavailable = true;
      });

    const observer = new ResizeObserver(() => {
      if (!refs.current.displayUnavailable) refs.current.app?.resize();
    });
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      try {
        installed?.disposeScene?.();
      } catch {
        /* Continue independent renderer ownership cleanup. */
      }
      try {
        destroyEditorPixiApp(installed);
      } catch {
        /* A failed renderer cannot prevent clearing its published refs. */
      }
      refs.current = createEmptyPixiAppRefs();
      globalPixiRefs = null;
    };
  }, [containerRef, preserveDrawingBuffer, generation]);

  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const app = refs.current.app;
    if (!app) return;
    app.renderer.background.color = THEME_BG_COLORS[theme] ?? PIXI_CONFIG.BG_COLOR;
  }, [theme]);

  return refs;
}
