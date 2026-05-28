// ColliderRect, ColliderCircle, ColliderMesh, ColliderShape, ColliderData,

import type { LayerId } from "./layer";

export interface ColliderRect {
  type: "rectangle";

  x: number;

  y: number;
  width: number;
  height: number;
}

export interface ColliderCircle {
  type: "circle";

  x: number;

  y: number;
  radius: number;
}

export interface ColliderMesh {
  type: "mesh";

  meshId: LayerId;
}

export type ColliderShape = ColliderRect | ColliderCircle | ColliderMesh;

export interface ColliderData {
  id: string;

  name: string;

  shape: ColliderShape;

  tag?: string;

  enabled: boolean;
}

export type ColliderConfig = ColliderData;

export interface ColliderHitResult {
  colliderId: string;

  colliderName: string;

  tag?: string;

  meshId?: string;
}
