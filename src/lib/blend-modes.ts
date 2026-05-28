import type { BlendMode } from "@vivi2d/core/types";

export {
  BLEND_MODES_ALL,
  isValidBlendMode,
  toPixiBlendMode,
} from "@vivi2d/renderer-pixi/blend-modes";

export const BLEND_MODE_GROUPS: {
  label: string;
  modes: readonly BlendMode[];
}[] = [
  { label: "Basic", modes: ["normal", "add", "multiply"] },
  {
    label: "Light and Contrast",
    modes: ["screen", "overlay", "hard-light", "soft-light"],
  },
  { label: "Tone", modes: ["darken", "lighten"] },
  { label: "Dodge and Burn", modes: ["color-dodge", "color-burn"] },
  { label: "Difference", modes: ["difference", "exclusion"] },
];
