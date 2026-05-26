import type { BLEND_MODES } from "pixi.js";

export type PixiBlendMode =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

const BLEND_MODE_MAP: Record<string, BLEND_MODES> = {
  normal: "normal",
  add: "add",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color dodge": "color-dodge",
  "color-burn": "color-burn",
  "color burn": "color-burn",
  "hard-light": "hard-light",
  "hard light": "hard-light",
  "soft-light": "soft-light",
  "soft light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
};

export const BLEND_MODES_ALL: readonly PixiBlendMode[] = [
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
] as const;

export function toPixiBlendMode(mode: PixiBlendMode | string): BLEND_MODES {
  return BLEND_MODE_MAP[mode] ?? "normal";
}

export function isValidBlendMode(mode: string): mode is PixiBlendMode {
  return (BLEND_MODES_ALL as readonly string[]).includes(mode);
}
