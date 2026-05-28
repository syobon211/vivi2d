import type { BoneNode, LayerNode } from "@vivi2d/core";

export type RuntimeAffine2D = [number, number, number, number, number, number];

export const RUNTIME_IDENTITY_AFFINE: Readonly<RuntimeAffine2D> = [
  1, 0, 0, 1, 0, 0,
];

export function multiplyRuntimeAffine(
  parent: Readonly<RuntimeAffine2D>,
  child: Readonly<RuntimeAffine2D>,
): RuntimeAffine2D {
  return [
    parent[0] * child[0] + parent[2] * child[1],
    parent[1] * child[0] + parent[3] * child[1],
    parent[0] * child[2] + parent[2] * child[3],
    parent[1] * child[2] + parent[3] * child[3],
    parent[0] * child[4] + parent[2] * child[5] + parent[4],
    parent[1] * child[4] + parent[3] * child[5] + parent[5],
  ];
}

export function invertRuntimeAffine(
  matrix: Readonly<RuntimeAffine2D>,
): RuntimeAffine2D {
  const determinant = matrix[0] * matrix[3] - matrix[2] * matrix[1];
  if (Math.abs(determinant) < 1e-12) return [...RUNTIME_IDENTITY_AFFINE];
  const inverseDeterminant = 1 / determinant;
  return [
    matrix[3] * inverseDeterminant,
    -matrix[1] * inverseDeterminant,
    -matrix[2] * inverseDeterminant,
    matrix[0] * inverseDeterminant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) * inverseDeterminant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) * inverseDeterminant,
  ];
}

export function computeRuntimeBoneLocalTransform(
  bone: BoneNode,
): RuntimeAffine2D {
  const cosine = Math.cos(bone.bone.angle);
  const sine = Math.sin(bone.bone.angle);
  const scaleX = bone.bone.scaleX;
  const scaleY = bone.bone.scaleY;
  return [
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    bone.x,
    bone.y,
  ];
}

export function buildRuntimeBoneMap(
  layers: readonly LayerNode[],
): Map<string, BoneNode> {
  const map = new Map<string, BoneNode>();
  visitRuntimeBoneLayers(layers, map);
  return map;
}

export function computeRuntimeBoneWorldTransforms(
  layers: readonly LayerNode[],
): Map<string, RuntimeAffine2D> {
  const boneMap = buildRuntimeBoneMap(layers);
  const worldTransforms = new Map<string, RuntimeAffine2D>();
  const visiting = new Set<string>();
  const visitingStack: string[] = [];
  const cyclicBones = new Set<string>();

  const markCycleFrom = (boneId: string): void => {
    const startIndex = visitingStack.indexOf(boneId);
    if (startIndex < 0) {
      cyclicBones.add(boneId);
      return;
    }
    for (let index = startIndex; index < visitingStack.length; index += 1) {
      cyclicBones.add(visitingStack[index]!);
    }
  };

  const computeWorld = (bone: BoneNode): RuntimeAffine2D => {
    const cached = worldTransforms.get(bone.id);
    if (cached) return cached;
    if (visiting.has(bone.id)) {
      markCycleFrom(bone.id);
      return computeRuntimeBoneLocalTransform(bone);
    }

    visiting.add(bone.id);
    visitingStack.push(bone.id);

    const local = computeRuntimeBoneLocalTransform(bone);
    let world: RuntimeAffine2D;
    try {
      if (bone.parentBoneId) {
        const parent = boneMap.get(bone.parentBoneId);
        if (parent && visiting.has(parent.id)) {
          markCycleFrom(parent.id);
          world = local;
        } else {
          world = parent
            ? multiplyRuntimeAffine(computeWorld(parent), local)
            : local;
        }
      } else {
        world = local;
      }
      if (cyclicBones.has(bone.id)) {
        world = local;
      }
    } finally {
      visiting.delete(bone.id);
      visitingStack.pop();
    }

    worldTransforms.set(bone.id, world);
    return world;
  };

  for (const bone of boneMap.values()) {
    computeWorld(bone);
  }

  return worldTransforms;
}

export function transformRuntimePoint(
  matrix: Readonly<RuntimeAffine2D>,
  x: number,
  y: number,
): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}

function visitRuntimeBoneLayers(
  layers: readonly LayerNode[],
  map: Map<string, BoneNode>,
): void {
  for (const node of layers) {
    if (node.kind === "bone") map.set(node.id, node);
    if (node.children.length > 0) visitRuntimeBoneLayers(node.children, map);
  }
}
