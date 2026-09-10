import {
  type Application,
  type ApplicationOptions,
  Color,
  type EventSystem,
  EventsTicker,
  GlBackBufferSystem,
  GlContextSystem,
  isWebGLSupported,
} from "pixi.js";

interface EventOwner {
  events: WeakRef<EventSystem>;
  paused: boolean;
  frequency: number;
}

interface CanvasRestoration {
  gl: WebGLRenderingContext;
  completion: Promise<Error | undefined>;
  cancelLateLossGuard?: () => void;
}

// Weak references avoid retaining apps disposed directly through pixiApp.
const eventOwners: EventOwner[] = [];
const canvasRestorations = new WeakMap<HTMLCanvasElement, CanvasRestoration>();

export function preparePixiCanvas(
  canvas: HTMLCanvasElement,
  options: Pick<ApplicationOptions, "backgroundColor" | "backgroundAlpha" | "antialias">,
): void {
  // Pixi constructs its event system before validating the background. Reject
  // unsupported colors before that can replace another app's singleton owner.
  try {
    new Color(options.backgroundColor || 0);
  } catch {
    throw new Error("Invalid renderer background color.");
  }
  // Match automatic backend selection; do not pre-create GL on fallback paths.
  if (!isWebGLSupported()) return;
  const defaults = GlContextSystem.defaultOptions;
  // Respect explicit host-wide context/multiview configuration without taking
  // ownership of a different canvas. Vivi itself does not set these options.
  if (defaults.context || defaults.multiView) return;
  const attributes: WebGLContextAttributes = {
    alpha: (options.backgroundAlpha ?? 1) < 1,
    premultipliedAlpha: defaults.premultipliedAlpha ?? true,
    antialias: !!options.antialias && !GlBackBufferSystem.defaultOptions.useBackBuffer,
    stencil: true,
    preserveDrawingBuffer: defaults.preserveDrawingBuffer,
    powerPreference: defaults.powerPreference ?? "default",
  };
  try {
    const gl2 =
      defaults.preferWebGLVersion === 2 && canvas.getContext("webgl2", attributes);
    const gl = gl2 || canvas.getContext("webgl", attributes);
    if (!gl || gl.isContextLost()) throw new Error();
    if (
      !gl2 &&
      !gl.getExtension("OES_vertex_array_object") &&
      !gl.getExtension("MOZ_OES_vertex_array_object") &&
      !gl.getExtension("WEBKIT_OES_vertex_array_object")
    ) {
      throw new Error();
    }
  } catch {
    // Automatic initialization cannot return a partially initialized renderer
    // for rollback. Reject these known context failures before allocating it.
    throw new Error("Could not initialize the renderer canvas.");
  }
}

export function rememberPixiEventOwner(): void {
  const current = EventsTicker.events;
  for (let i = eventOwners.length - 1; i >= 0; i--) {
    const events = eventOwners[i]?.events.deref();
    if (!events?.domElement || !events.renderer || events === current)
      eventOwners.splice(i, 1);
  }
  if (current?.domElement && current.renderer) {
    eventOwners.push({
      events: new WeakRef(current),
      paused: EventsTicker.pauseUpdate,
      frequency: EventsTicker.interactionFrequency,
    });
  }
}

export function registerPixiApplication(app: Application): void {
  rememberPixiEventOwner();
  const events = app.renderer.events;
  if (events && !eventOwners.some((owner) => owner.events.deref() === events)) {
    // Another async initialization may already own Pixi's singleton ticker.
    eventOwners.unshift({ events: new WeakRef(events), paused: true, frequency: 10 });
  }
}

export async function waitForPixiCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const restoration = canvasRestorations.get(canvas);
  if (!restoration) return;
  const error = await restoration.completion;
  // A timed-out context can recover later. Do not permanently poison its canvas.
  if (error && restoration.gl.isContextLost()) throw error;
  restoration.cancelLateLossGuard?.();
  if (canvasRestorations.get(canvas) === restoration) canvasRestorations.delete(canvas);
}

export function disposePixiApplication(
  app: Application,
  canvas: HTMLCanvasElement,
): void {
  rememberPixiEventOwner();
  const disposedEvents = app.renderer.events;
  const finishDisposal = prepareCanvasRestoration(app, canvas);
  try {
    // false preserves the DOM canvas and does not release other apps' global pools.
    app.destroy(false, { children: true });
  } finally {
    finishDisposal?.();
    for (let i = eventOwners.length - 1; i >= 0; i--) {
      const owner = eventOwners[i];
      const events = owner?.events.deref();
      if (!events?.domElement || !events.renderer || events === disposedEvents) {
        eventOwners.splice(i, 1);
      }
    }
    // Pixi EventSystem.destroy clears the singleton even for another live app.
    const owner = eventOwners[eventOwners.length - 1];
    const events = owner?.events.deref();
    if (owner && events) {
      EventsTicker.init(events);
      EventsTicker.domElement = events.domElement;
      EventsTicker.pauseUpdate = owner.paused;
      EventsTicker.interactionFrequency = owner.frequency;
      EventsTicker.addTickerListener();
    }
  }
}

function prepareCanvasRestoration(app: Application, canvas: HTMLCanvasElement) {
  const renderer = app.renderer;
  if (!("gl" in renderer) || !renderer.gl || renderer.gl.canvas !== canvas) return;
  const gl = renderer.gl;
  // The saved public extension remains usable after getExtension starts returning null.
  const extension = renderer.context.extensions.loseContext;
  if (!extension) return;
  const alreadyLost = gl.isContextLost();
  let finishDisposal: (() => void) | undefined;
  const completion = new Promise<Error | undefined>((resolve) => {
    let finished = false;
    let lossObserved = false;
    let restoreAttempted = false;
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(restoreTimer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      resolve(error);
    };
    const requestRestore = () => {
      if (finished) return;
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        restoreAttempted = true;
        try {
          extension.restoreContext();
        } catch {
          finish(new Error("Could not restore the renderer canvas."));
        }
      }, 0);
    };
    const lost = (event: Event) => {
      lossObserved = true;
      event.preventDefault();
      requestRestore();
    };
    const restored = () => finish();
    const timeout = setTimeout(() => {
      if (gl.isContextLost()) {
        if (!lossObserved) {
          restoration.cancelLateLossGuard = guardLateContextLoss(canvas, extension);
        } else if (!restoreAttempted) {
          restoreContextOnce(extension);
        }
      }
      finish(new Error("Timed out restoring the renderer canvas."));
    }, 3000);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    finishDisposal = () => {
      if (!gl.isContextLost()) finish();
      else if (alreadyLost) requestRestore();
    };
  });
  // Resolve with an error value: disposal without a subsequent create has no
  // unhandled rejection. Completion stays bounded. A one-shot late loss guard
  // lives only on its canvas, without an app reference or a global timer root.
  const restoration: CanvasRestoration = { gl, completion };
  canvasRestorations.set(canvas, restoration);
  return finishDisposal;
}

function restoreContextOnce(extension: WEBGL_lose_context): void {
  setTimeout(() => {
    try {
      extension.restoreContext();
    } catch {
      // The bounded wait already reported its error; do not throw from a timer.
    }
  }, 0);
}

function guardLateContextLoss(
  canvas: HTMLCanvasElement,
  extension: WEBGL_lose_context,
): () => void {
  // A stalled event loop can deliver the deadline before the queued loss event.
  // Preserve its default prevention without retaining the disposed Application.
  const lost = (event: Event) => {
    event.preventDefault();
    restoreContextOnce(extension);
  };
  canvas.addEventListener("webglcontextlost", lost, { once: true });
  // If no loss event remained queued, later observed recovery cancels this guard
  // before the canvas is reused, so it cannot react to a future unrelated loss.
  return () => canvas.removeEventListener("webglcontextlost", lost);
}
