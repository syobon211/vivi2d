export const PHASER_BLEND = {
  NORMAL: 0,
  ADD: 1,
  MULTIPLY: 2,
  SCREEN: 3,
} as const;

export type PhaserBlendMode = "normal" | "add" | "multiply" | "screen";

const warnedModes = new Set<string>();

export type WarnHandler = (message: string) => void;

const defaultWarnHandler: WarnHandler = (msg) => console.warn(msg);
let warnHandler: WarnHandler = defaultWarnHandler;

export function setWarnHandler(handler: WarnHandler | null): void {
  warnHandler = handler ?? defaultWarnHandler;
}

export function toPhaserBlendMode(mode: PhaserBlendMode | string): number {
  switch (mode) {
    case "normal":
      return PHASER_BLEND.NORMAL;
    case "add":
      return PHASER_BLEND.ADD;
    case "multiply":
      return PHASER_BLEND.MULTIPLY;
    case "screen":
      return PHASER_BLEND.SCREEN;
    default:
      if (!warnedModes.has(mode)) {
        warnedModes.add(mode);
        warnHandler(
      `[vivi2d/phaser] Blend mode "${mode}" is unsupported. Falling back to "normal".`,
        );
      }
      return PHASER_BLEND.NORMAL;
  }
}
