import "pixi.js/unsafe-eval";
import { Application, Container, Graphics } from "pixi.js";

export interface EditorPixiRefs {
  app: Application | null;
  world: Container | null;
  background: Graphics | null;
  overlay: Container | null;
}

export interface InitEditorPixiAppOptions {
  container: HTMLElement;
  backgroundColor: number;
  antialias?: boolean;
  resolution?: number;
  autoDensity?: boolean;
  preserveDrawingBuffer?: boolean;
  worldLabel?: string;
  backgroundLabel?: string;
  overlayLabel?: string | null;
}

export const EMPTY_EDITOR_PIXI_REFS: EditorPixiRefs = {
  app: null,
  world: null,
  background: null,
  overlay: null,
};

export async function initEditorPixiApp(
  options: InitEditorPixiAppOptions,
): Promise<EditorPixiRefs> {
  const app = new Application();
  await app.init({
    resizeTo: options.container,
    backgroundColor: options.backgroundColor,
    antialias: options.antialias ?? true,
    resolution: options.resolution ?? (window.devicePixelRatio || 1),
    autoDensity: options.autoDensity ?? true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  });

  const world = new Container();
  world.label = options.worldLabel ?? "world";
  app.stage.addChild(world);

  const background = new Graphics();
  background.label = options.backgroundLabel ?? "canvas-bg";
  world.addChild(background);

  let overlay: Container | null = null;
  if (options.overlayLabel !== null) {
    overlay = new Container();
    overlay.label = options.overlayLabel ?? "overlay";
    app.stage.addChild(overlay);
  }

  return { app, world, background, overlay };
}

export function destroyEditorPixiApp(refs: EditorPixiRefs | null | undefined): void {
  refs?.app?.destroy(true);
}

export function createOverlayGraphics(
  overlay: Container | null | undefined,
  label: string,
): Graphics | null {
  if (!overlay) {
    return null;
  }

  const graphics = new Graphics();
  graphics.label = label;
  overlay.addChild(graphics);
  return graphics;
}

export function destroyOverlayGraphics(
  overlay: Container | null | undefined,
  graphics: Graphics | null | undefined,
): void {
  if (!graphics) {
    return;
  }
  overlay?.removeChild?.(graphics);
  graphics.destroy();
}
