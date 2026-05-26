import type { PartCategory } from "./auto-setup-role";

const SEETHROUGH_LABEL_MAP: Record<string, PartCategory> = {
  face: "face",
  front_hair: "hairFront",
  back_hair: "hairBack",
  iris_left: "eyeLeft",
  iris_right: "eyeRight",
  irides_left: "eyeLeft",
  irides_right: "eyeRight",
  eye_white_left: "eyeLeft",
  eye_white_right: "eyeRight",
  eyewhite_left: "eyeLeft",
  eyewhite_right: "eyeRight",
  eyelash_left: "eyeLeft",
  eyelash_right: "eyeRight",
  eyebrow_left: "eyebrowLeft",
  eyebrow_right: "eyebrowRight",
  eyewear: "accessory",
  nose: "nose",
  mouth: "mouth",
  ear_left: "ear",
  ear_right: "ear",
  ear_accessory_left: "accessory",
  ear_accessory_right: "accessory",
  hair_front: "hairFront",
  hair_back: "hairBack",
  neck: "body",
  neckwear: "body",
  torso_wear: "body",
  topwear: "body",
  bottomwear: "body",
  hand_accessory_left: "handLeft",
  hand_accessory_right: "handRight",
  handwear_left: "handLeft",
  handwear_right: "handRight",
  leg_wear: "body",
  legwear: "body",
  foot_wear: "body",
  footwear: "body",
  objects: "accessory",
  headwear: "accessory",
  tail: "tail",
  wings: "accessory",
};

function normalizeSeeThroughLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_l$/, "_left")
    .replace(/_r$/, "_right");
}

export function mapSeeThroughLabelToRole(label: string): PartCategory {
  return SEETHROUGH_LABEL_MAP[normalizeSeeThroughLabel(label)] ?? "unknown";
}
