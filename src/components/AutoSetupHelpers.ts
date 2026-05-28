import type { MeshDensityPreset } from "@vivi2d/core/constants";
import {
  applyAutoSetupMeshToLayer,
  remapAutoSetupWeightBoneIds,
} from "@vivi2d/editor-core/auto-setup-apply-command";
import type { PartCategory } from "@/lib/ai-part-detector";
import type { I18nKey } from "@/lib/i18n";

export {
  applyAutoSetupMeshToLayer as applyMeshToLayer,
  remapAutoSetupWeightBoneIds as remapWeightBoneIds,
};

export const CATEGORY_LABEL_KEYS: Record<PartCategory, I18nKey> = {
  head: "prop.semanticRole.head",
  face: "prop.semanticRole.face",
  eyeLeft: "prop.semanticRole.eyeLeft",
  eyeRight: "prop.semanticRole.eyeRight",
  eyebrowLeft: "prop.semanticRole.eyebrowLeft",
  eyebrowRight: "prop.semanticRole.eyebrowRight",
  mouth: "prop.semanticRole.mouth",
  nose: "prop.semanticRole.nose",
  hair: "prop.semanticRole.hair",
  hairFront: "prop.semanticRole.hairFront",
  hairBack: "prop.semanticRole.hairBack",
  hairSide: "prop.semanticRole.hairSide",
  body: "prop.semanticRole.body",
  armLeft: "prop.semanticRole.armLeft",
  armRight: "prop.semanticRole.armRight",
  handLeft: "prop.semanticRole.handLeft",
  handRight: "prop.semanticRole.handRight",
  legLeft: "prop.semanticRole.legLeft",
  legRight: "prop.semanticRole.legRight",
  tail: "prop.semanticRole.tail",
  ear: "prop.semanticRole.ear",
  accessory: "prop.semanticRole.accessory",
  unknown: "prop.semanticRole.unknown",
};

export const MESH_PRESET_LABEL_KEYS: Record<MeshDensityPreset, I18nKey> = {
  coarse: "prop.coarse",
  standard: "prop.standard",
  fine: "prop.fine",
};
