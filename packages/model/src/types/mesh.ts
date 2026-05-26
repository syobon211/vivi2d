// SkinData, MeshRenderState,

import type {
  AffineMatrix,
  BlendMode,
  LayerId,
  RGBColor,
} from "./layer";

export interface SkinWeight {
  boneId: LayerId;

  weight: number;
}

export interface SkinData {
  managedTag?: string;
  managedSignature?: string;
  managedSourceFingerprint?: string;
  manualSplitSourceLayerId?: LayerId;
  manualSplitSourceFingerprint?: string;
  manualSplitLayerId?: LayerId;

  weights: SkinWeight[][];

  bindPoseInverse: Record<LayerId, AffineMatrix>;
}

export type MeshVertexSpace = "local" | "model";

export interface MeshRenderState {
  id: string;

  vertices: Float32Array;

  /**
   * Coordinate space for vertices. Omitted states are treated as "local" for
   * compatibility with renderer test doubles and older adapters.
   */
  verticesSpace?: MeshVertexSpace;

  uvs: Float32Array;

  indices: Uint32Array;

  x: number;

  y: number;

  opacity: number;

  visible: boolean;

  blendMode: BlendMode;

  multiplyColor: RGBColor;

  screenColor: RGBColor | undefined;

  drawOrder: number;

  culled: boolean;
}
