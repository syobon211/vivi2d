import type { IKBoneConstraint, IKController } from "@vivi2d/core";
import type { RuntimeAffine2D } from "./bone";

export interface RuntimeIKSolution {
  readonly solvedAngles: Map<string, number>;
  readonly reached: boolean;
}

export interface RuntimeCCDBoneInput {
  readonly id: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly angle: number;
  readonly length: number;
  readonly constraint: IKBoneConstraint;
}

export function normalizeRuntimeIKAngle(angle: number): number {
  let normalized = angle % (2 * Math.PI);
  if (normalized >= Math.PI) normalized -= 2 * Math.PI;
  if (normalized < -Math.PI) normalized += 2 * Math.PI;
  return normalized;
}

export function clampRuntimeIKAngle(
  angle: number,
  min: number,
  max: number,
): number {
  const normalized = normalizeRuntimeIKAngle(angle);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

export function solveRuntimeTwoBoneIK(
  rootX: number,
  rootY: number,
  length1: number,
  length2: number,
  targetX: number,
  targetY: number,
  poleX?: number,
  poleY?: number,
  constraints?: [IKBoneConstraint, IKBoneConstraint],
): [number, number] {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angleToTarget = Math.atan2(dy, dx);

  if (distance >= length1 + length2) {
    return applyRuntimeTwoBoneConstraints(
      angleToTarget,
      angleToTarget,
      constraints,
    );
  }

  if (distance <= Math.abs(length1 - length2)) {
    return applyRuntimeTwoBoneConstraints(
      angleToTarget,
      angleToTarget + Math.PI,
      constraints,
    );
  }

  const cosAngle1 =
    (length1 * length1 + distance * distance - length2 * length2) /
    (2 * length1 * distance);
  const clampedCos1 = Math.max(-1, Math.min(1, cosAngle1));
  let innerAngle1 = Math.acos(clampedCos1);

  if (poleX !== undefined && poleY !== undefined) {
    const poleDx = poleX - rootX;
    const poleDy = poleY - rootY;
    const cross = dx * poleDy - dy * poleDx;
    if (cross < 0) innerAngle1 = -innerAngle1;
  }

  const angle1 = angleToTarget + innerAngle1;
  const jointX = rootX + length1 * Math.cos(angle1);
  const jointY = rootY + length1 * Math.sin(angle1);
  const angle2 = Math.atan2(targetY - jointY, targetX - jointX);

  return applyRuntimeTwoBoneConstraints(angle1, angle2, constraints);
}

export function solveRuntimeCCDIK(
  bones: RuntimeCCDBoneInput[],
  targetX: number,
  targetY: number,
  maxIterations = 10,
  tolerance = 0.5,
): RuntimeIKSolution {
  if (bones.length === 0) {
    return { solvedAngles: new Map(), reached: false };
  }

  const angles = bones.map((bone) => bone.angle);
  const positions = bones.map((bone) => ({ x: bone.worldX, y: bone.worldY }));

  const computeEndEffector = (): { x: number; y: number } => {
    const last = bones.length - 1;
    return {
      x: positions[last]!.x + bones[last]!.length * Math.cos(angles[last]!),
      y: positions[last]!.y + bones[last]!.length * Math.sin(angles[last]!),
    };
  };

  const updatePositions = (): void => {
    for (let index = 1; index < bones.length; index += 1) {
      const previous = index - 1;
      positions[index]!.x =
        positions[previous]!.x +
        bones[previous]!.length * Math.cos(angles[previous]!);
      positions[index]!.y =
        positions[previous]!.y +
        bones[previous]!.length * Math.sin(angles[previous]!);
    }
  };

  let reached = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    for (let index = bones.length - 1; index >= 0; index -= 1) {
      const endEffector = computeEndEffector();
      const toEnd = Math.atan2(
        endEffector.y - positions[index]!.y,
        endEffector.x - positions[index]!.x,
      );
      const toTarget = Math.atan2(
        targetY - positions[index]!.y,
        targetX - positions[index]!.x,
      );
      const deltaAngle = normalizeRuntimeIKAngle(toTarget - toEnd);
      angles[index] = clampRuntimeIKAngle(
        angles[index]! + deltaAngle,
        bones[index]!.constraint.minAngle,
        bones[index]!.constraint.maxAngle,
      );
      updatePositions();
    }

    const endEffector = computeEndEffector();
    const distance = Math.sqrt(
      (endEffector.x - targetX) ** 2 + (endEffector.y - targetY) ** 2,
    );
    if (distance < tolerance) {
      reached = true;
      break;
    }
  }

  const solvedAngles = new Map<string, number>();
  for (let index = 0; index < bones.length; index += 1) {
    solvedAngles.set(bones[index]!.id, angles[index]!);
  }

  return { solvedAngles, reached };
}

export function buildRuntimeCCDBoneInputs(
  controller: IKController,
  worldTransforms: Map<string, RuntimeAffine2D>,
  boneLengths: Map<string, number>,
): RuntimeCCDBoneInput[] {
  return controller.boneChain.map((boneConstraint) => {
    const transform = worldTransforms.get(boneConstraint.boneId);
    return {
      id: boneConstraint.boneId,
      worldX: transform ? transform[4] : 0,
      worldY: transform ? transform[5] : 0,
      angle: transform ? Math.atan2(transform[1], transform[0]) : 0,
      length: boneLengths.get(boneConstraint.boneId) ?? 0,
      constraint: boneConstraint,
    };
  });
}

export function solveRuntimeIKController(
  controller: IKController,
  worldTransforms: Map<string, RuntimeAffine2D>,
  boneLengths: Map<string, number>,
): RuntimeIKSolution {
  const { targetX, targetY, influence } = controller;
  if (influence <= 0 || controller.boneChain.length === 0) {
    return { solvedAngles: new Map(), reached: false };
  }

  if (controller.solverType === "twoBone" && controller.boneChain.length === 2) {
    const bone0 = controller.boneChain[0]!;
    const bone1 = controller.boneChain[1]!;
    const transform0 = worldTransforms.get(bone0.boneId);
    const rootX = transform0 ? transform0[4] : 0;
    const rootY = transform0 ? transform0[5] : 0;
    const length1 = boneLengths.get(bone0.boneId) ?? 0;
    const length2 = boneLengths.get(bone1.boneId) ?? 0;
    const [angle1, angle2] = solveRuntimeTwoBoneIK(
      rootX,
      rootY,
      length1,
      length2,
      targetX,
      targetY,
      controller.poleTargetX,
      controller.poleTargetY,
      [bone0, bone1],
    );

    const solvedAngles = new Map<string, number>();
    solvedAngles.set(bone0.boneId, angle1);
    solvedAngles.set(bone1.boneId, angle2);

    const distance = Math.sqrt((targetX - rootX) ** 2 + (targetY - rootY) ** 2);
    return {
      solvedAngles,
      reached:
        distance >= Math.abs(length1 - length2) &&
        distance <= length1 + length2,
    };
  }

  const inputs = buildRuntimeCCDBoneInputs(
    controller,
    worldTransforms,
    boneLengths,
  );
  const result = solveRuntimeCCDIK(
    inputs,
    targetX,
    targetY,
    controller.maxIterations ?? 10,
  );

  return result;
}

export function mapRuntimeIKToParameters(
  controller: IKController,
  solution: RuntimeIKSolution,
): Record<string, number> {
  const parameters: Record<string, number> = {};
  for (const mapping of controller.parameterMappings) {
    const solvedAngle = solution.solvedAngles.get(mapping.boneId);
    if (solvedAngle === undefined) continue;

    const angleRange = mapping.angleMax - mapping.angleMin;
    if (Math.abs(angleRange) < 1e-10) continue;

    const t =
      (normalizeRuntimeIKAngle(solvedAngle) - mapping.angleMin) / angleRange;
    const clamped = Math.max(0, Math.min(1, t));
    parameters[mapping.parameterId] =
      mapping.paramMin + clamped * (mapping.paramMax - mapping.paramMin);
  }
  return parameters;
}

function applyRuntimeTwoBoneConstraints(
  angle1: number,
  angle2: number,
  constraints?: [IKBoneConstraint, IKBoneConstraint],
): [number, number] {
  if (!constraints) return [angle1, angle2];
  return [
    clampRuntimeIKAngle(angle1, constraints[0].minAngle, constraints[0].maxAngle),
    clampRuntimeIKAngle(angle2, constraints[1].minAngle, constraints[1].maxAngle),
  ];
}
