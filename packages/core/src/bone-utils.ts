import type { BoneNode, LayerNode } from "./types";
import { isBone } from "./types";

export type Affine2D = [number, number, number, number, number, number];

export const IDENTITY: Readonly<Affine2D> = [1, 0, 0, 1, 0, 0];

export function multiplyAffine(p: Readonly<Affine2D>, c: Readonly<Affine2D>): Affine2D {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

export function invertAffine(m: Readonly<Affine2D>): Affine2D {
  const det = m[0] * m[3] - m[2] * m[1];
  if (Math.abs(det) < 1e-12) return [...IDENTITY];
  const invDet = 1 / det;
  return [
    m[3] * invDet,
    -m[1] * invDet,
    -m[2] * invDet,
    m[0] * invDet,
    (m[2] * m[5] - m[3] * m[4]) * invDet,
    (m[1] * m[4] - m[0] * m[5]) * invDet,
  ];
}

export function computeBoneLocalTransform(bone: BoneNode): Affine2D {
  const cos = Math.cos(bone.bone.angle);
  const sin = Math.sin(bone.bone.angle);
  const sx = bone.bone.scaleX;
  const sy = bone.bone.scaleY;
  return [cos * sx, sin * sx, -sin * sy, cos * sy, bone.x, bone.y];
}

export function buildBoneMap(layers: LayerNode[]): Map<string, BoneNode> {
  const map = new Map<string, BoneNode>();
  const visit = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      if (isBone(node)) {
        map.set(node.id, node);
      }
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };
  visit(layers);
  return map;
}

export function computeBoneWorldTransforms(layers: LayerNode[]): Map<string, Affine2D> {
  const boneMap = buildBoneMap(layers);
  const worldTransforms = new Map<string, Affine2D>();

  const computeWorld = (bone: BoneNode): Affine2D => {
    const cached = worldTransforms.get(bone.id);
    if (cached) return cached;

    const local = computeBoneLocalTransform(bone);

    let world: Affine2D;
    if (bone.parentBoneId) {
      const parent = boneMap.get(bone.parentBoneId);
      if (parent) {
        const parentWorld = computeWorld(parent);
        world = multiplyAffine(parentWorld, local);
      } else {
        world = local;
      }
    } else {
      world = local;
    }

    worldTransforms.set(bone.id, world);
    return world;
  };

  for (const bone of boneMap.values()) {
    computeWorld(bone);
  }

  return worldTransforms;
}

export function transformPoint(
  m: Readonly<Affine2D>,
  x: number,
  y: number,
): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
