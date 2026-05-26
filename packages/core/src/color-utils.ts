import { DEFAULT_COLORS, DRAW_ORDER } from "./constants";
import type { RGBColor } from "./types";

export function rgbColorToHex(color: RGBColor): number {
  const r = Math.round(Math.max(0, Math.min(1, color.r)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, color.g)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, color.b)) * 255);
  return (r << 16) | (g << 8) | b;
}

export function hexToRgbColor(hex: number): RGBColor {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

export function lerpColor(a: RGBColor, b: RGBColor, t: number): RGBColor {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function isScreenColorDefault(color: RGBColor | undefined): boolean {
  if (!color) return true;
  return color.r === 0 && color.g === 0 && color.b === 0;
}

export function getDrawOrder(drawOrder: number | undefined): number {
  return drawOrder ?? DRAW_ORDER.DEFAULT;
}

export function getMultiplyColor(color: RGBColor | undefined): RGBColor {
  return color ?? DEFAULT_COLORS.MULTIPLY;
}

export function getScreenColor(color: RGBColor | undefined): RGBColor {
  return color ?? DEFAULT_COLORS.SCREEN;
}

export function rgbToHexString(color: RGBColor): string {
  return `#${rgbColorToHex(color).toString(16).padStart(6, "0")}`;
}

export function hexStringToRgb(hex: string): RGBColor {
  return hexToRgbColor(Number.parseInt(hex.slice(1), 16));
}
