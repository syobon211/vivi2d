export function worldToScreen(
  wx: number,
  wy: number,
  zoom: number,
  panX: number,
  panY: number,
): { sx: number; sy: number } {
  return { sx: wx * zoom + panX, sy: wy * zoom + panY };
}

export function capturePointer(e: React.PointerEvent): void {
  const el = e.target;
  if (el instanceof HTMLElement) el.setPointerCapture(e.pointerId);
}

export function releasePointer(e: React.PointerEvent): void {
  const el = e.target;
  if (el instanceof HTMLElement) el.releasePointerCapture(e.pointerId);
}

export function screenToWorld(
  sx: number,
  sy: number,
  zoom: number,
  panX: number,
  panY: number,
): { wx: number; wy: number } {
  return { wx: (sx - panX) / zoom, wy: (sy - panY) / zoom };
}
