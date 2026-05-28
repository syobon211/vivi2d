export const E2E_CANVAS_READBACK_STORAGE_KEY = "vivi2d-e2e-canvas-readback";

export function shouldEnableE2ECanvasReadback(): boolean {
  if (import.meta.env.VITE_EXPOSE_E2E !== "true") {
    return false;
  }

  try {
    return globalThis.localStorage?.getItem(E2E_CANVAS_READBACK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
