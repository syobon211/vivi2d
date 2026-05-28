import {
  AddEquation,
  type Blending,
  type BlendingDstFactor,
  type BlendingEquation,
  type BlendingSrcFactor,
  CustomBlending,
  DstColorFactor,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OneMinusSrcColorFactor,
  SrcAlphaFactor,
  ZeroFactor,
} from "three";

export type ThreeBlendMode = "normal" | "add" | "multiply" | "screen";

export interface ThreeBlendConfig {
  blending: Blending;
  blendSrc?: BlendingSrcFactor;
  blendDst?: BlendingDstFactor;
  blendEquation?: BlendingEquation;
}

const warnedModes = new Set<string>();

export type WarnHandler = (message: string) => void;

const defaultWarnHandler: WarnHandler = (msg) => console.warn(msg);
let warnHandler: WarnHandler = defaultWarnHandler;

export function setWarnHandler(handler: WarnHandler | null): void {
  warnHandler = handler ?? defaultWarnHandler;
}

function normalBlendConfig(): ThreeBlendConfig {
  return {
    blending: NormalBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendEquation: AddEquation,
  };
}

export function toThreeBlendConfig(mode: ThreeBlendMode | string): ThreeBlendConfig {
  switch (mode) {
    case "normal":
      return normalBlendConfig();

    case "add":
      return {
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneFactor,
        blendEquation: AddEquation,
      };

    case "multiply":
      return {
        blending: CustomBlending,
        blendSrc: DstColorFactor,
        blendDst: ZeroFactor,
        blendEquation: AddEquation,
      };

    case "screen":
      // screen = src + dst * (1 - src)
      return {
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcColorFactor,
        blendEquation: AddEquation,
      };

    default:
      if (!warnedModes.has(mode)) {
        warnedModes.add(mode);
        warnHandler(
          `[vivi2d/three] Blend mode "${mode}" is unsupported. Falling back to "normal".`,
        );
      }
      return normalBlendConfig();
  }
}
