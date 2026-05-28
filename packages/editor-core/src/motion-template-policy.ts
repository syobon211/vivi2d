import type { LayerSemanticRole } from "@vivi2d/core/types";

export type MotionKind = "rigid" | "secondaryMotion" | "skinned" | "manualOnly";

export type RootAnchorKind =
  | "headAdjacent"
  | "faceAdjacent"
  | "parentLayerAdjacent"
  | "attachmentPoint"
  | "top"
  | "inner"
  | "center";

export type TipAnchorKind =
  | "farthestFromRoot"
  | "downward"
  | "outward"
  | "longAxisEnd"
  | "manualReview";

export type MotionPhysicsPreset = "none" | "softHair" | "tail" | "ribbon" | "accessory";

export interface MotionSemanticPolicy {
  role: LayerSemanticRole;
  policyId: string;
  policyVersion: number;
  defaultMotionKind: MotionKind;
  protected: boolean;
  rootAnchorPriority: readonly RootAnchorKind[];
  tipPriority: readonly TipAnchorKind[];
  maxRotationDeg: number;
  maxDisplacementPxRatio: number;
  physicsPreset: MotionPhysicsPreset;
  requireUserOptIn?: boolean;
}

export interface SemanticRigTemplate {
  id: "defaultManualSplitV1";
  version: 1;
  roles: Readonly<Record<string, MotionSemanticPolicy>>;
  fallback: MotionSemanticPolicy;
}

export interface MotionSemanticPolicyContext {
  nearProtectedFace?: boolean;
  smallAccessory?: boolean;
}

const protectedRigidPolicy = (
  role: LayerSemanticRole,
  rootAnchorPriority: readonly RootAnchorKind[] = ["center"],
): MotionSemanticPolicy =>
  Object.freeze({
    role,
    policyId: "policy.semantic.v1.rigid",
    policyVersion: 1,
    defaultMotionKind: "rigid",
    protected: true,
    rootAnchorPriority,
    tipPriority: ["manualReview"] as const,
    maxRotationDeg: 0,
    maxDisplacementPxRatio: 0,
    physicsPreset: "none",
  });

const policy = (
  role: LayerSemanticRole,
  values: Omit<MotionSemanticPolicy, "role" | "policyId" | "policyVersion">,
): MotionSemanticPolicy =>
  Object.freeze({
    role,
    policyId: policyIdForMotionKind(values.defaultMotionKind),
    policyVersion: 1,
    ...values,
  });

export const DEFAULT_SEMANTIC_RIG_TEMPLATE: SemanticRigTemplate = Object.freeze({
  id: "defaultManualSplitV1",
  version: 1,
  roles: Object.freeze({
    face: protectedRigidPolicy("face", ["faceAdjacent", "center"]),
    eyeLeft: protectedRigidPolicy("eyeLeft", ["faceAdjacent", "center"]),
    eyeRight: protectedRigidPolicy("eyeRight", ["faceAdjacent", "center"]),
    mouth: protectedRigidPolicy("mouth", ["faceAdjacent", "center"]),
    nose: protectedRigidPolicy("nose", ["faceAdjacent", "center"]),
    hair: policy("hair", {
      defaultMotionKind: "secondaryMotion",
      protected: false,
      rootAnchorPriority: ["headAdjacent", "top", "inner"],
      tipPriority: ["downward", "outward", "farthestFromRoot"],
      maxRotationDeg: 12,
      maxDisplacementPxRatio: 0.12,
      physicsPreset: "softHair",
    }),
    hairFront: policy("hairFront", {
      defaultMotionKind: "secondaryMotion",
      protected: false,
      rootAnchorPriority: ["headAdjacent", "faceAdjacent", "top"],
      tipPriority: ["downward", "outward", "farthestFromRoot"],
      maxRotationDeg: 8,
      maxDisplacementPxRatio: 0.08,
      physicsPreset: "softHair",
    }),
    hairBack: policy("hairBack", {
      defaultMotionKind: "secondaryMotion",
      protected: false,
      rootAnchorPriority: ["headAdjacent", "top", "inner"],
      tipPriority: ["downward", "farthestFromRoot"],
      maxRotationDeg: 14,
      maxDisplacementPxRatio: 0.14,
      physicsPreset: "softHair",
    }),
    hairSide: policy("hairSide", {
      defaultMotionKind: "secondaryMotion",
      protected: false,
      rootAnchorPriority: ["headAdjacent", "top", "inner"],
      tipPriority: ["outward", "downward", "farthestFromRoot"],
      maxRotationDeg: 12,
      maxDisplacementPxRatio: 0.12,
      physicsPreset: "softHair",
    }),
    tail: policy("tail", {
      defaultMotionKind: "secondaryMotion",
      protected: false,
      rootAnchorPriority: ["parentLayerAdjacent", "attachmentPoint", "inner"],
      tipPriority: ["farthestFromRoot", "longAxisEnd", "outward"],
      maxRotationDeg: 18,
      maxDisplacementPxRatio: 0.18,
      physicsPreset: "tail",
    }),
    accessory: policy("accessory", {
      defaultMotionKind: "manualOnly",
      protected: false,
      rootAnchorPriority: ["attachmentPoint", "parentLayerAdjacent", "center"],
      tipPriority: ["manualReview"],
      maxRotationDeg: 8,
      maxDisplacementPxRatio: 0.06,
      physicsPreset: "accessory",
      requireUserOptIn: true,
    }),
    body: policy("body", {
      defaultMotionKind: "skinned",
      protected: false,
      rootAnchorPriority: ["parentLayerAdjacent", "top", "center"],
      tipPriority: ["downward", "longAxisEnd"],
      maxRotationDeg: 4,
      maxDisplacementPxRatio: 0.04,
      physicsPreset: "none",
    }),
    armLeft: limbPolicy("armLeft"),
    armRight: limbPolicy("armRight"),
    handLeft: limbPolicy("handLeft"),
    handRight: limbPolicy("handRight"),
    legLeft: limbPolicy("legLeft"),
    legRight: limbPolicy("legRight"),
  }),
  fallback: Object.freeze({
    role: "unknown",
    policyId: "policy.semantic.v1.manualOnly",
    policyVersion: 1,
    defaultMotionKind: "manualOnly",
    protected: false,
    rootAnchorPriority: ["center"] as const,
    tipPriority: ["manualReview"] as const,
    maxRotationDeg: 0,
    maxDisplacementPxRatio: 0,
    physicsPreset: "none",
    requireUserOptIn: true,
  }),
});

export function getMotionSemanticPolicy(
  role: LayerSemanticRole,
  context: MotionSemanticPolicyContext = {},
  template: SemanticRigTemplate = DEFAULT_SEMANTIC_RIG_TEMPLATE,
): MotionSemanticPolicy {
  const base = template.roles[role] ?? template.fallback;
  if (
    role === "accessory" &&
    (context.nearProtectedFace === true || context.smallAccessory === true)
  ) {
    return Object.freeze({
      ...base,
      policyId: "policy.semantic.v1.rigid",
      policyVersion: 1,
      defaultMotionKind: "rigid",
      rootAnchorPriority: ["faceAdjacent", "attachmentPoint", "center"] as const,
      tipPriority: ["manualReview"] as const,
      maxRotationDeg: 0,
      maxDisplacementPxRatio: 0,
      physicsPreset: "none",
      requireUserOptIn: true,
    });
  }
  return base;
}

export function isProtectedMotionSemantic(role: LayerSemanticRole): boolean {
  return getMotionSemanticPolicy(role).protected;
}

function policyIdForMotionKind(kind: MotionKind): string {
  switch (kind) {
    case "rigid":
      return "policy.semantic.v1.rigid";
    case "secondaryMotion":
      return "policy.semantic.v1.secondary";
    case "skinned":
      return "policy.semantic.v1.skinned";
    case "manualOnly":
      return "policy.semantic.v1.manualOnly";
  }
}

function limbPolicy(role: LayerSemanticRole): MotionSemanticPolicy {
  return policy(role, {
    defaultMotionKind: "skinned",
    protected: false,
    rootAnchorPriority: ["parentLayerAdjacent", "top", "inner"],
    tipPriority: ["downward", "longAxisEnd"],
    maxRotationDeg: 6,
    maxDisplacementPxRatio: 0.06,
    physicsPreset: "none",
  });
}
