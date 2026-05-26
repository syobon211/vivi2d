import { DEFAULT_COLORS, DRAW_ORDER } from "@vivi2d/core";
import type { RGBColor } from "@vivi2d/core";

export function getRuntimeDrawOrder(drawOrder: number | undefined): number {
  return drawOrder ?? DRAW_ORDER.DEFAULT;
}

export function getRuntimeMultiplyColor(color: RGBColor | undefined): RGBColor {
  return color ?? DEFAULT_COLORS.MULTIPLY;
}

export function isRuntimeScreenColorDefault(
  color: RGBColor | undefined,
): boolean {
  if (!color) return true;
  return color.r === 0 && color.g === 0 && color.b === 0;
}
