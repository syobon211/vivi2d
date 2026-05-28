import type { Affine2D } from "./bone-utils";
import type { IKBoneConstraint, IKController } from "./types";

export interface IKSolution {
  /** Final absolute bone angles keyed by bone id. */
  solvedAngles: Map<string, number>;
  /** Whether the solver reached the target within the configured tolerance. */
  reached: boolean;
}

export function normalizeIKAngle(angle: number): number {
  angle = angle % (2 * Math.PI);
  if (angle >= Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function clampIKAngle(angle: number, min: number, max: number): number {
  const normalized = normalizeIKAngle(angle);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

export function solveTwoBoneIK(
  rootX: number,
  rootY: number,
  len1: number,
  len2: number,
  targetX: number,
  targetY: number,
  poleX?: number,
  poleY?: number,
  constraints?: [IKBoneConstraint, IKBoneConstraint],
): [number, number] {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const angleToTarget = Math.atan2(dy, dx);

  if (dist >= len1 + len2) {
    const angle1 = angleToTarget;
    const angle2 = angleToTarget;
    return applyTwoBoneConstraints(angle1, angle2, constraints);
  }

  if (dist <= Math.abs(len1 - len2)) {
    const angle1 = angleToTarget;
    const angle2 = angleToTarget + Math.PI;
    return applyTwoBoneConstraints(angle1, angle2, constraints);
  }

  const cosAngle1 = (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist);
  const clampedCos1 = Math.max(-1, Math.min(1, cosAngle1));
  let innerAngle1 = Math.acos(clampedCos1);

  if (poleX !== undefined && poleY !== undefined) {
    const poleDx = poleX - rootX;
    const poleDy = poleY - rootY;
    const cross = dx * poleDy - dy * poleDx;
    if (cross < 0) {
      innerAngle1 = -innerAngle1;
    }
  }

  const angle1 = angleToTarget + innerAngle1;

  const jointX = rootX + len1 * Math.cos(angle1);
  const jointY = rootY + len1 * Math.sin(angle1);

  const angle2 = Math.atan2(targetY - jointY, targetX - jointX);

  return applyTwoBoneConstraints(angle1, angle2, constraints);
}

function applyTwoBoneConstraints(
  angle1: number,
  angle2: number,
  constraints?: [IKBoneConstraint, IKBoneConstraint],
): [number, number] {
  if (!constraints) return [angle1, angle2];
  return [
    clampIKAngle(angle1, constraints[0].minAngle, constraints[0].maxAngle),
    clampIKAngle(angle2, constraints[1].minAngle, constraints[1].maxAngle),
  ];
}

export interface CCDBoneInput {
  id: string;
  /** Bone origin in world space. */
  worldX: number;
  /** Bone origin in world space. */
  worldY: number;
  /** Current absolute angle in radians. */
  angle: number;
  /** Bone length in world-space units. */
  length: number;
  /** Per-bone angle limits. */
  constraint: IKBoneConstraint;
}

/** Solves an arbitrary IK chain with cyclic coordinate descent. */
export function solveCCDIK(
  bones: CCDBoneInput[],
  targetX: number,
  targetY: number,
  maxIterations = 10,
  tolerance = 0.5,
): IKSolution {
  if (bones.length === 0) {
    return { solvedAngles: new Map(), reached: false };
  }

  const angles = bones.map((b) => b.angle);
  const positions = bones.map((b) => ({ x: b.worldX, y: b.worldY }));

  const computeEndEffector = (): { x: number; y: number } => {
    const last = bones.length - 1;
    return {
      x: positions[last]!.x + bones[last]!.length * Math.cos(angles[last]!),
      y: positions[last]!.y + bones[last]!.length * Math.sin(angles[last]!),
    };
  };

  const updatePositions = () => {
    for (let i = 1; i < bones.length; i++) {
      const prev = i - 1;
      positions[i]!.x =
        positions[prev]!.x + bones[prev]!.length * Math.cos(angles[prev]!);
      positions[i]!.y =
        positions[prev]!.y + bones[prev]!.length * Math.sin(angles[prev]!);
    }
  };

  let reached = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    for (let i = bones.length - 1; i >= 0; i--) {
      const endEffector = computeEndEffector();

      const toEnd = Math.atan2(
        endEffector.y - positions[i]!.y,
        endEffector.x - positions[i]!.x,
      );
      const toTarget = Math.atan2(targetY - positions[i]!.y, targetX - positions[i]!.x);

      const deltaAngle = normalizeIKAngle(toTarget - toEnd);
      angles[i] = angles[i]! + deltaAngle;

      angles[i] = clampIKAngle(
        angles[i]!,
        bones[i]!.constraint.minAngle,
        bones[i]!.constraint.maxAngle,
      );

      updatePositions();
    }

    const ee = computeEndEffector();
    const dist = Math.sqrt((ee.x - targetX) ** 2 + (ee.y - targetY) ** 2);
    if (dist < tolerance) {
      reached = true;
      break;
    }
  }

  const solvedAngles = new Map<string, number>();
  for (let i = 0; i < bones.length; i++) {
    solvedAngles.set(bones[i]!.id, angles[i]!);
  }

  return { solvedAngles, reached };
}

export function buildCCDBoneInputs(
  controller: IKController,
  worldTransforms: Map<string, Affine2D>,
  boneLengths: Map<string, number>,
): CCDBoneInput[] {
  return controller.boneChain.map((bc) => {
    const wt = worldTransforms.get(bc.boneId);
    const wx = wt ? wt[4] : 0;
    const wy = wt ? wt[5] : 0;
    const angle = wt ? Math.atan2(wt[1], wt[0]) : 0;
    const length = boneLengths.get(bc.boneId) ?? 0;
    return {
      id: bc.boneId,
      worldX: wx,
      worldY: wy,
      angle,
      length,
      constraint: bc,
    };
  });
}

export function solveIKController(
  controller: IKController,
  worldTransforms: Map<string, Affine2D>,
  boneLengths: Map<string, number>,
): IKSolution {
  const { targetX, targetY, influence } = controller;

  if (influence <= 0 || controller.boneChain.length === 0) {
    return { solvedAngles: new Map(), reached: false };
  }

  if (controller.solverType === "twoBone" && controller.boneChain.length === 2) {
    const bone0 = controller.boneChain[0]!;
    const bone1 = controller.boneChain[1]!;
    const wt0 = worldTransforms.get(bone0.boneId);
    const rootX = wt0 ? wt0[4] : 0;
    const rootY = wt0 ? wt0[5] : 0;
    const len1 = boneLengths.get(bone0.boneId) ?? 0;
    const len2 = boneLengths.get(bone1.boneId) ?? 0;

    const [a1, a2] = solveTwoBoneIK(
      rootX,
      rootY,
      len1,
      len2,
      targetX,
      targetY,
      controller.poleTargetX,
      controller.poleTargetY,
      [bone0, bone1],
    );

    const solvedAngles = new Map<string, number>();

    solvedAngles.set(bone0.boneId, a1);
    solvedAngles.set(bone1.boneId, a2);

    const dist = Math.sqrt((targetX - rootX) ** 2 + (targetY - rootY) ** 2);
    const reached = dist >= Math.abs(len1 - len2) && dist <= len1 + len2;

    return { solvedAngles, reached };
  }

  // Fall back to CCD for chains that are not the dedicated two-bone case.
  const inputs = buildCCDBoneInputs(controller, worldTransforms, boneLengths);
  const result = solveCCDIK(inputs, targetX, targetY, controller.maxIterations ?? 10);

  return result;
}

export function mapIKToParameters(
  controller: IKController,
  solution: IKSolution,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const mapping of controller.parameterMappings) {
    const solvedAngle = solution.solvedAngles.get(mapping.boneId);
    if (solvedAngle === undefined) continue;

    const angleRange = mapping.angleMax - mapping.angleMin;
    if (Math.abs(angleRange) < 1e-10) continue;

    const t = (normalizeIKAngle(solvedAngle) - mapping.angleMin) / angleRange;
    const clamped = Math.max(0, Math.min(1, t));
    params[mapping.parameterId] =
      mapping.paramMin + clamped * (mapping.paramMax - mapping.paramMin);
  }
  return params;
}
