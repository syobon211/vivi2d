import type {
  IKBoneConstraint,
  IKController,
  IKParameterMapping,
  ProjectData,
} from "@vivi2d/core/types";

export type LimbBendProfileId = "standard" | "loose";
export type LimbBendProfileDetection = LimbBendProfileId | "custom" | null;

export interface AddIKControllerInput {
  name: string;
  solverType: "twoBone" | "ccd";
  boneChain: readonly IKBoneConstraint[];
}

const EPSILON = 1e-6;
const defaultCreateId = () => crypto.randomUUID();

function deg(value: number): number {
  return (value * Math.PI) / 180;
}

function cloneBoneChain(
  boneChain: readonly IKBoneConstraint[],
): IKBoneConstraint[] {
  return boneChain.map((constraint) => ({ ...constraint }));
}

function findIKController(
  project: ProjectData,
  controllerId: string,
): IKController | undefined {
  return project.ikControllers?.find((controller) => controller.id === controllerId);
}

function ensureIKControllers(project: ProjectData): IKController[] {
  if (!project.ikControllers) project.ikControllers = [];
  return project.ikControllers;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const LIMB_BEND_PROFILES: Record<
  LimbBendProfileId,
  {
    labelKey: string;
    root: { minAngle: number; maxAngle: number };
    child: { minAngle: number; maxAngle: number };
  }
> = {
  standard: {
    labelKey: "ik.profile.standard",
    root: { minAngle: deg(-135), maxAngle: deg(135) },
    child: { minAngle: deg(0), maxAngle: deg(160) },
  },
  loose: {
    labelKey: "ik.profile.loose",
    root: { minAngle: deg(-160), maxAngle: deg(160) },
    child: { minAngle: deg(-15), maxAngle: deg(175) },
  },
};

export const LIMB_BEND_PROFILE_IDS = Object.keys(
  LIMB_BEND_PROFILES,
) as LimbBendProfileId[];

export function addIKController(
  project: ProjectData,
  input: AddIKControllerInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  ensureIKControllers(project).push({
    id,
    name: input.name,
    solverType: input.solverType,
    boneChain: cloneBoneChain(input.boneChain),
    targetX: 0,
    targetY: 0,
    influence: 1,
    parameterMappings: [],
  });
  return id;
}

export function removeIKController(
  project: ProjectData,
  controllerId: string,
): boolean {
  if (!project.ikControllers) return false;
  const beforeCount = project.ikControllers.length;
  project.ikControllers = project.ikControllers.filter(
    (controller) => controller.id !== controllerId,
  );
  return project.ikControllers.length !== beforeCount;
}

export function setIKTarget(
  project: ProjectData,
  controllerId: string,
  x: number,
  y: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  controller.targetX = x;
  controller.targetY = y;
  return true;
}

export function setIKPoleTarget(
  project: ProjectData,
  controllerId: string,
  x: number,
  y: number,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  controller.poleTargetX = x;
  controller.poleTargetY = y;
  return true;
}

export function setIKInfluence(
  project: ProjectData,
  controllerId: string,
  influence: number,
): boolean {
  if (!Number.isFinite(influence)) return false;
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  controller.influence = clamp(influence, 0, 1);
  return true;
}

export function setIKMaxIterations(
  project: ProjectData,
  controllerId: string,
  maxIterations: number,
): boolean {
  if (!Number.isFinite(maxIterations)) return false;
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  controller.maxIterations = Math.max(1, Math.round(maxIterations));
  return true;
}

export function addIKParameterMapping(
  project: ProjectData,
  controllerId: string,
  mapping: IKParameterMapping,
): boolean {
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  controller.parameterMappings.push({ ...mapping });
  return true;
}

export function removeIKParameterMapping(
  project: ProjectData,
  controllerId: string,
  index: number,
): boolean {
  const controller = findIKController(project, controllerId);
  if (!controller || index < 0 || index >= controller.parameterMappings.length) {
    return false;
  }
  controller.parameterMappings.splice(index, 1);
  return true;
}

export function canApplyLimbBendProfile(controller: IKController): boolean {
  return controller.solverType === "twoBone" && controller.boneChain.length === 2;
}

export function applyLimbBendProfile(
  controller: IKController,
  profileId: LimbBendProfileId,
): IKBoneConstraint[] | null {
  if (!canApplyLimbBendProfile(controller)) return null;
  const profile = LIMB_BEND_PROFILES[profileId];
  if (!profile) return null;

  return [
    {
      boneId: controller.boneChain[0]!.boneId,
      minAngle: profile.root.minAngle,
      maxAngle: profile.root.maxAngle,
    },
    {
      boneId: controller.boneChain[1]!.boneId,
      minAngle: profile.child.minAngle,
      maxAngle: profile.child.maxAngle,
    },
  ];
}

export function applyIKBendProfile(
  project: ProjectData,
  controllerId: string,
  profileId: LimbBendProfileId,
): boolean {
  const controller = findIKController(project, controllerId);
  if (!controller) return false;
  const nextChain = applyLimbBendProfile(controller, profileId);
  if (!nextChain) return false;
  controller.boneChain = nextChain;
  return true;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function approxConstraint(
  actual: IKBoneConstraint,
  expected: { minAngle: number; maxAngle: number },
): boolean {
  return (
    approxEqual(actual.minAngle, expected.minAngle) &&
    approxEqual(actual.maxAngle, expected.maxAngle)
  );
}

export function detectLimbBendProfile(
  controller: IKController,
): LimbBendProfileDetection {
  if (!canApplyLimbBendProfile(controller)) return null;

  for (const profileId of LIMB_BEND_PROFILE_IDS) {
    const profile = LIMB_BEND_PROFILES[profileId];
    if (
      approxConstraint(controller.boneChain[0]!, profile.root) &&
      approxConstraint(controller.boneChain[1]!, profile.child)
    ) {
      return profileId;
    }
  }

  return "custom";
}
