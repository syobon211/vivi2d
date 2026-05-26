import type { DetectedPart, PartCategory } from "./ai-part-detector";

export interface GeneratedBone {
  tempId: string;

  name: string;

  parentTempId: string | null;

  x: number;

  y: number;

  partCategory: PartCategory;
}

export interface GeneratedParameter {
  id?: string;
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  group: string;
}

export interface BoneGenerationResult {
  bones: GeneratedBone[];
  parameters: GeneratedParameter[];
}

export type GeneratedLabelLocale = "en" | "ja";

export interface BoneGenerationOptions {
  locale?: GeneratedLabelLocale;
}

interface BoneGenerationLabels {
  head: string;
  body: string;
  mouth: string;
  faceGroup: string;
  eyesGroup: string;
  browsGroup: string;
  mouthGroup: string;
  bodyGroup: string;
  armsGroup: string;
  left: string;
  right: string;
  faceX: string;
  faceY: string;
  faceZ: string;
  eye: (side: string) => string;
  eyeOpen: (side: string) => string;
  eyeX: (side: string) => string;
  eyeY: (side: string) => string;
  brow: (side: string) => string;
  browY: (side: string) => string;
  browAngle: (side: string) => string;
  mouthOpen: string;
  mouthForm: string;
  bodyX: string;
  bodyY: string;
  bodyRotation: string;
  arm: (side: string) => string;
  armRotation: (side: string) => string;
}

const LABELS: Record<GeneratedLabelLocale, BoneGenerationLabels> = {
  en: {
    head: "Head",
    body: "Body",
    mouth: "Mouth",
    faceGroup: "Face",
    eyesGroup: "Eyes",
    browsGroup: "Brows",
    mouthGroup: "Mouth",
    bodyGroup: "Body",
    armsGroup: "Arms",
    left: "Left",
    right: "Right",
    faceX: "Face X",
    faceY: "Face Y",
    faceZ: "Face Z",
    eye: (side) => `${side} Eye`,
    eyeOpen: (side) => `${side} Eye Open`,
    eyeX: (side) => `${side} Eye X`,
    eyeY: (side) => `${side} Eye Y`,
    brow: (side) => `${side} Brow`,
    browY: (side) => `${side} Brow Y`,
    browAngle: (side) => `${side} Brow Angle`,
    mouthOpen: "Mouth Open",
    mouthForm: "Mouth Form",
    bodyX: "Body X",
    bodyY: "Body Y",
    bodyRotation: "Body Rotation",
    arm: (side) => `${side} Arm`,
    armRotation: (side) => `${side} Arm Rotation`,
  },
  ja: {
    head: "頭",
    body: "体",
    mouth: "口",
    faceGroup: "顔",
    eyesGroup: "目",
    browsGroup: "眉",
    mouthGroup: "口",
    bodyGroup: "体",
    armsGroup: "腕",
    left: "左",
    right: "右",
    faceX: "顔 X",
    faceY: "顔 Y",
    faceZ: "顔 Z",
    eye: (side) => `${side}目`,
    eyeOpen: (side) => `${side}目 開閉`,
    eyeX: (side) => `${side}目 X`,
    eyeY: (side) => `${side}目 Y`,
    brow: (side) => `${side}眉`,
    browY: (side) => `${side}眉 Y`,
    browAngle: (side) => `${side}眉 角度`,
    mouthOpen: "口 開閉",
    mouthForm: "口 形状",
    bodyX: "体 X",
    bodyY: "体 Y",
    bodyRotation: "体 回転",
    arm: (side) => `${side}腕`,
    armRotation: (side) => `${side}腕 回転`,
  },
};

function resolveLabels(options?: BoneGenerationOptions): BoneGenerationLabels {
  return LABELS[options?.locale ?? "en"];
}

function getPartCenter(
  parts: DetectedPart[],
  category: PartCategory,
): { x: number; y: number } | null {
  const part = parts.find((p) => p.category === category);
  if (!part) return null;
  return {
    x: part.bounds.x + part.bounds.width / 2,
    y: part.bounds.y + part.bounds.height / 2,
  };
}

export function generateFaceBones(
  parts: DetectedPart[],
  canvasWidth: number,
  canvasHeight: number,
  options?: BoneGenerationOptions,
): BoneGenerationResult {
  const labels = resolveLabels(options);
  const bones: GeneratedBone[] = [];
  const parameters: GeneratedParameter[] = [];

  const headCenter = getPartCenter(parts, "head") ??
    getPartCenter(parts, "face") ?? {
      x: canvasWidth / 2,
      y: canvasHeight * 0.25,
    };

  bones.push({
    tempId: "bone_head",
    name: labels.head,
    parentTempId: null,
    x: headCenter.x,
    y: headCenter.y,
    partCategory: "head",
  });

  parameters.push(
    { name: labels.faceX, minValue: -30, maxValue: 30, defaultValue: 0, group: labels.faceGroup },
    { name: labels.faceY, minValue: -30, maxValue: 30, defaultValue: 0, group: labels.faceGroup },
    { name: labels.faceZ, minValue: -30, maxValue: 30, defaultValue: 0, group: labels.faceGroup },
  );

  for (const sideKey of ["left", "right"] as const) {
    const side = sideKey === "left" ? labels.left : labels.right;
    const cat = sideKey === "left" ? "eyeLeft" : "eyeRight";
    const eyeCenter = getPartCenter(parts, cat);
    if (eyeCenter) {
      bones.push({
        tempId: `bone_eye_${sideKey}`,
        name: labels.eye(side),
        parentTempId: "bone_head",
        x: eyeCenter.x,
        y: eyeCenter.y,
        partCategory: cat,
      });
    }
    parameters.push(
      { name: labels.eyeOpen(side), minValue: 0, maxValue: 1, defaultValue: 1, group: labels.eyesGroup },
      { name: labels.eyeX(side), minValue: -1, maxValue: 1, defaultValue: 0, group: labels.eyesGroup },
      { name: labels.eyeY(side), minValue: -1, maxValue: 1, defaultValue: 0, group: labels.eyesGroup },
    );
  }

  for (const sideKey of ["left", "right"] as const) {
    const side = sideKey === "left" ? labels.left : labels.right;
    const cat = sideKey === "left" ? "eyebrowLeft" : "eyebrowRight";
    const center = getPartCenter(parts, cat);
    if (center) {
      bones.push({
        tempId: `bone_eyebrow_${sideKey}`,
        name: labels.brow(side),
        parentTempId: "bone_head",
        x: center.x,
        y: center.y,
        partCategory: cat,
      });
    }
    parameters.push(
      { name: labels.browY(side), minValue: -1, maxValue: 1, defaultValue: 0, group: labels.browsGroup },
      {
        name: labels.browAngle(side),
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
        group: labels.browsGroup,
      },
    );
  }

  const mouthCenter = getPartCenter(parts, "mouth");
  if (mouthCenter) {
    bones.push({
      tempId: "bone_mouth",
      name: labels.mouth,
      parentTempId: "bone_head",
      x: mouthCenter.x,
      y: mouthCenter.y,
      partCategory: "mouth",
    });
  }
  parameters.push(
    { name: labels.mouthOpen, minValue: 0, maxValue: 1, defaultValue: 0, group: labels.mouthGroup },
    { name: labels.mouthForm, minValue: -1, maxValue: 1, defaultValue: 0, group: labels.mouthGroup },
  );

  return { bones, parameters };
}

export function generateBodyBones(
  parts: DetectedPart[],
  canvasWidth: number,
  canvasHeight: number,
  options?: BoneGenerationOptions,
): BoneGenerationResult {
  const labels = resolveLabels(options);
  const bones: GeneratedBone[] = [];
  const parameters: GeneratedParameter[] = [];

  const bodyCenter = getPartCenter(parts, "body") ?? {
    x: canvasWidth / 2,
    y: canvasHeight * 0.5,
  };

  bones.push({
    tempId: "bone_body",
    name: labels.body,
    parentTempId: null,
    x: bodyCenter.x,
    y: bodyCenter.y,
    partCategory: "body",
  });

  parameters.push(
    { name: labels.bodyX, minValue: -10, maxValue: 10, defaultValue: 0, group: labels.bodyGroup },
    { name: labels.bodyY, minValue: -10, maxValue: 10, defaultValue: 0, group: labels.bodyGroup },
    { name: labels.bodyRotation, minValue: -10, maxValue: 10, defaultValue: 0, group: labels.bodyGroup },
  );

  for (const sideKey of ["left", "right"] as const) {
    const side = sideKey === "left" ? labels.left : labels.right;
    const cat = sideKey === "left" ? "armLeft" : "armRight";
    const armCenter = getPartCenter(parts, cat);
    if (armCenter) {
      bones.push({
        tempId: `bone_arm_${sideKey}`,
        name: labels.arm(side),
        parentTempId: "bone_body",
        x: armCenter.x,
        y: armCenter.y,
        partCategory: cat,
      });
    }
    parameters.push({
      name: labels.armRotation(side),
      minValue: -30,
      maxValue: 30,
      defaultValue: 0,
      group: labels.armsGroup,
    });
  }

  return { bones, parameters };
}

export function generateAllBones(
  parts: DetectedPart[],
  canvasWidth: number,
  canvasHeight: number,
  options?: BoneGenerationOptions,
): BoneGenerationResult {
  const face = generateFaceBones(parts, canvasWidth, canvasHeight, options);
  const body = generateBodyBones(parts, canvasWidth, canvasHeight, options);

  const headBone = face.bones.find((b) => b.tempId === "bone_head");
  const bodyBone = body.bones.find((b) => b.tempId === "bone_body");
  if (headBone && bodyBone) {
    headBone.parentTempId = "bone_body";
  }

  return {
    bones: [...body.bones, ...face.bones],
    parameters: [...face.parameters, ...body.parameters],
  };
}
