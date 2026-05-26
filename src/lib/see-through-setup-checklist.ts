import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode, LayerSemanticRole, ProjectData } from "@vivi2d/core/types";
import { getSeeThroughImportMetadata, isBone, isViviMesh } from "@vivi2d/core/types";
import { summarizeSeeThroughAutoSetup } from "./see-through-auto-setup";
import type { SeeThroughDepthRigHintSummary } from "./see-through-depth-rig-hints";
import { hasSeeThroughTechnicalNamePrefix } from "@vivi2d/editor-core/see-through-technical-name";

export type SeeThroughSetupChecklistStatus =
  | "done"
  | "partial"
  | "pending"
  | "blocked"
  | "na";

export interface SeeThroughSetupChecklistItem {
  id:
    | "cleanup"
    | "roles"
    | "mesh"
    | "depth"
    | "eyeClipping"
    | "eyeRig"
    | "mouthRig"
    | "physics";
  label: string;
  status: SeeThroughSetupChecklistStatus;
  detail: string;
}

export interface SeeThroughSetupChecklistSummary {
  isSeeThroughProject: boolean;
  items: SeeThroughSetupChecklistItem[];
}

export interface SeeThroughSecondaryPhysicsSummary {
  applicable: boolean;
  status: Extract<SeeThroughSetupChecklistStatus, "done" | "partial" | "pending" | "na">;
  detail: string;
}

export interface SeeThroughMeshRefinementSummary {
  status: Extract<SeeThroughSetupChecklistStatus, "done" | "partial" | "pending">;
  detail: string;
}

type SetupChecklistLocale = "en" | "ja";

const CHECKLIST_LABEL_JA: Record<SeeThroughSetupChecklistItem["id"], string> = {
  cleanup: "リグ準備クリーンアップ",
  roles: "セマンティックロール",
  mesh: "メッシュ改善",
  depth: "深度確認",
  eyeClipping: "目クリッピング",
  eyeRig: "目リグ",
  mouthRig: "口リグ",
  physics: "二次物理",
};

const ROLE_LABEL_JA: Partial<Record<LayerSemanticRole, string>> = {
  head: "頭",
  face: "顔",
  eyeLeft: "左目",
  eyeRight: "右目",
  eyebrowLeft: "左眉",
  eyebrowRight: "右眉",
  mouth: "口",
  nose: "鼻",
  hair: "髪",
  hairFront: "前髪",
  hairBack: "後ろ髪",
  hairSide: "横髪",
  body: "体",
  armLeft: "左腕",
  armRight: "右腕",
  handLeft: "左手",
  handRight: "右手",
  legLeft: "左脚",
  legRight: "右脚",
  tail: "尻尾",
  ear: "耳",
  accessory: "アクセサリ",
};

function extractNumbers(detail: string): number[] {
  return [...detail.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function localizeMissingRoles(detail: string): string {
  const match = detail.match(/Missing critical roles: (.+)\./);
  if (!match) return "重要なロールが不足しています。";
  const labels = match[1]!
    .split(",")
    .map((role) => role.trim() as LayerSemanticRole)
    .map((role) => ROLE_LABEL_JA[role] ?? role)
    .join("、");
  return `重要なロールが不足しています: ${labels}。`;
}

function localizeChecklistDetailJa(item: SeeThroughSetupChecklistItem): string {
  const numbers = extractNumbers(item.detail);
  switch (item.id) {
    case "cleanup":
      if (item.status === "done") return "取り込みレイヤー名は整理済みです。";
      if (item.status === "pending") {
        return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の取り込みレイヤー名に技術用トークンが残っています。`;
      }
      return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の取り込みレイヤー名を整理済みです。`;
    case "roles":
      if (item.detail.startsWith("Missing critical roles:")) {
        return localizeMissingRoles(item.detail);
      }
      return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の取り込みメッシュが分類済みです。`;
    case "mesh":
      if (item.status === "pending") {
        return "取り込みメッシュはまだ既定の四角形トポロジーを使っています。";
      }
      return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の取り込みメッシュを既定四角形より細かく改善済みです。`;
    case "depth":
      if (item.status === "na") return "See-through 深度ヒントはありません。";
      if (item.status === "done") {
        return "深度順と取り込み境界はリギング準備済みです。";
      }
      if (item.status === "blocked") {
        return `${numbers[0] ?? 0} 件のブロッキング深度問題を深度インスペクターで確認してください。`;
      }
      if (item.status === "pending") {
        return `${numbers[0] ?? 0} 件の警告ヒントと ${numbers[1] ?? 0} 件の参考ヒントがあります。`;
      }
      return `${numbers[0] ?? 0} 件の参考深度ヒントがあります。`;
    case "eyeClipping":
      if (item.status === "na") return "取り込み済みの目パーツは見つかりませんでした。";
      if (item.detail.includes("incomplete or ambiguous")) {
        return "取り込み済みの目パーツが不足しているか曖昧です。";
      }
      if (item.detail.includes("has not been applied")) {
        return "目ペアはありますが、クリッピングはまだ適用されていません。";
      }
      return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の目サイドが正しくクリッピングされています。`;
    case "eyeRig":
      if (item.status === "na") return "取り込み済みの目パーツは見つかりませんでした。";
      if (item.detail.includes("Finish eye clipping")) {
        return "目リグを作成する前に、目クリッピングを完了してください。";
      }
      if (item.detail.includes("Some eye sides")) {
        return "一部の目サイドで、有効なクリッピング済みペアがまだ不足しています。";
      }
      if (item.detail.includes("has not been created")) {
        return "目クリッピングは準備済みですが、目リグはまだ作成されていません。";
      }
      return `${numbers[0] ?? 0}/${numbers[1] ?? 0} 件の準備済み目サイドに管理コントロールがあります。`;
    case "mouthRig":
      if (item.status === "na") return "取り込み済みの口レイヤーは見つかりませんでした。";
      if (item.status === "blocked") {
        return `${numbers[0] ?? 0} 件の取り込み済み口レイヤーが見つかりました。`;
      }
      if (item.status === "done") return "管理された口コントロールがあります。";
      return "単一の取り込み済み口レイヤーはコントロール作成の準備ができています。";
    case "physics":
      if (item.status === "na") return "取り込み済みの髪系レイヤーは見つかりませんでした。";
      if (item.status === "done") {
        return `${numbers[0] ?? 0} 件の管理対象ヘアストランドヘルパーがあります。`;
      }
      if (item.status === "partial") {
        return `${numbers[0] ?? 0} 件の物理グループがありますが、管理対象ヘアヘルパーはありません。`;
      }
      return "二次物理ヘルパーはまだありません。";
  }
}

function localizeChecklistItems(
  items: SeeThroughSetupChecklistItem[],
  locale: SetupChecklistLocale,
): SeeThroughSetupChecklistItem[] {
  if (locale !== "ja") return items;
  return items.map((item) => ({
    ...item,
    label: CHECKLIST_LABEL_JA[item.id],
    detail: localizeChecklistDetailJa(item),
  }));
}

type EyeSide = "left" | "right";

const IRIS_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "iris_left",
  right: "iris_right",
};

const EYE_WHITE_LABEL_BY_SIDE: Record<EyeSide, string> = {
  left: "eye_white_left",
  right: "eye_white_right",
};

const HAIR_LIKE_ROLES = new Set<LayerSemanticRole>([
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "tail",
  "ear",
]);

function normalizeLabel(label: string | undefined) {
  return (label ?? "").normalize("NFKC").trim().toLowerCase();
}

function listImportedViviMeshes(project: ProjectData): ViviMeshNode[] {
  return flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
}

function buildCleanupItem(
  importedViviMeshes: readonly ViviMeshNode[],
): SeeThroughSetupChecklistItem {
  const remainingTechnical = importedViviMeshes.filter((layer) =>
    hasSeeThroughTechnicalNamePrefix(layer.name),
  ).length;
  const total = importedViviMeshes.length;
  if (remainingTechnical === 0) {
    return {
      id: "cleanup",
      label: "Ready to Rig cleanup",
      status: "done",
      detail: "Imported layer names are cleaned.",
    };
  }
  if (remainingTechnical === total) {
    return {
      id: "cleanup",
      label: "Ready to Rig cleanup",
      status: "pending",
      detail: `${remainingTechnical}/${total} imported layer names still keep technical tokens.`,
    };
  }
  return {
    id: "cleanup",
    label: "Ready to Rig cleanup",
    status: "partial",
    detail: `${total - remainingTechnical}/${total} imported layer names are cleaned.`,
  };
}

function buildRolesItem(project: ProjectData): SeeThroughSetupChecklistItem {
  const summary = summarizeSeeThroughAutoSetup(project);
  const total = summary.importedViviMeshCount;
  const classified = summary.classifiedViviMeshCount;
  if (classified === total && summary.missingCriticalRoles.length === 0) {
    return {
      id: "roles",
      label: "Semantic roles",
      status: "done",
      detail: `${classified}/${total} imported meshes are classified.`,
    };
  }
  const missingCritical = [...new Set(summary.missingCriticalRoles)];
  if (classified === 0 || missingCritical.length > 0) {
    return {
      id: "roles",
      label: "Semantic roles",
      status: "blocked",
      detail:
        missingCritical.length > 0
          ? `Missing critical roles: ${missingCritical.join(", ")}.`
          : `0/${total} imported meshes are classified.`,
    };
  }
  return {
    id: "roles",
    label: "Semantic roles",
    status: "partial",
    detail: `${classified}/${total} imported meshes are classified.`,
  };
}

export function summarizeSeeThroughMeshRefinement(
  importedViviMeshes: readonly ViviMeshNode[],
): SeeThroughMeshRefinementSummary {
  const total = importedViviMeshes.length;
  const refined = importedViviMeshes.filter(
    (layer) => layer.mesh.vertices.length / 2 > 4,
  ).length;
  if (refined === total) {
    return {
      status: "done",
      detail: `${refined}/${total} imported meshes were refined beyond the default quad.`,
    };
  }
  if (refined === 0) {
    return {
      status: "pending",
      detail: "Imported meshes still use the default quad topology.",
    };
  }
  return {
    status: "partial",
    detail: `${refined}/${total} imported meshes were refined beyond the default quad.`,
  };
}

function buildMeshItem(
  importedViviMeshes: readonly ViviMeshNode[],
): SeeThroughSetupChecklistItem {
  const summary = summarizeSeeThroughMeshRefinement(importedViviMeshes);
  return {
    id: "mesh",
    label: "Mesh refinement",
    status: summary.status,
    detail: summary.detail,
  };
}

function buildDepthItem(
  depthRigHintSummary: SeeThroughDepthRigHintSummary | null | undefined,
): SeeThroughSetupChecklistItem {
  if (!depthRigHintSummary?.isSeeThroughProject) {
    return {
      id: "depth",
      label: "Depth review",
      status: "na",
      detail: "No See-through depth hints are available.",
    };
  }

  const { blocking, warning, info } = depthRigHintSummary.counts;
  if (blocking === 0 && warning === 0 && info === 0) {
    return {
      id: "depth",
      label: "Depth review",
      status: "done",
      detail: "Depth ordering and imported bounds are ready for rigging.",
    };
  }
  if (blocking > 0) {
    return {
      id: "depth",
      label: "Depth review",
      status: "blocked",
      detail: `${blocking} blocking depth issue(s) need review in the Depth Inspector.`,
    };
  }
  if (warning > 0) {
    return {
      id: "depth",
      label: "Depth review",
      status: "pending",
      detail: `${warning} warning hint(s) and ${info} advisory hint(s) are available in the Depth Inspector.`,
    };
  }
  return {
    id: "depth",
    label: "Depth review",
    status: "partial",
    detail: `${info} advisory depth hint(s) are available in the Depth Inspector.`,
  };
}

function resolveEyeSideState(importedViviMeshes: readonly ViviMeshNode[], side: EyeSide) {
  const irisCandidates = importedViviMeshes.filter(
    (layer) =>
      normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
      IRIS_LABEL_BY_SIDE[side],
  );
  const eyeWhiteCandidates = importedViviMeshes.filter(
    (layer) =>
      normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
      EYE_WHITE_LABEL_BY_SIDE[side],
  );
  const applicable = irisCandidates.length > 0 || eyeWhiteCandidates.length > 0;
  const validPair = irisCandidates.length === 1 && eyeWhiteCandidates.length === 1;
  const clipped =
    validPair &&
    (irisCandidates[0]?.clipMaskIds ?? []).includes(eyeWhiteCandidates[0]!.id);
  return { applicable, validPair, clipped };
}

function buildEyeClippingItem(
  importedViviMeshes: readonly ViviMeshNode[],
): SeeThroughSetupChecklistItem {
  const sideStates = (["left", "right"] as const)
    .map((side) => resolveEyeSideState(importedViviMeshes, side))
    .filter((state) => state.applicable);
  if (sideStates.length === 0) {
    return {
      id: "eyeClipping",
      label: "Eye clipping",
      status: "na",
      detail: "No imported eye parts were found.",
    };
  }

  const validPairs = sideStates.filter((state) => state.validPair).length;
  const clippedPairs = sideStates.filter(
    (state) => state.validPair && state.clipped,
  ).length;

  if (
    clippedPairs === sideStates.length &&
    sideStates.every((state) => state.validPair)
  ) {
    return {
      id: "eyeClipping",
      label: "Eye clipping",
      status: "done",
      detail: `${clippedPairs}/${sideStates.length} eye side(s) are clipped correctly.`,
    };
  }
  if (validPairs === 0) {
    return {
      id: "eyeClipping",
      label: "Eye clipping",
      status: "blocked",
      detail: "Imported eye parts are incomplete or ambiguous.",
    };
  }
  if (clippedPairs > 0) {
    return {
      id: "eyeClipping",
      label: "Eye clipping",
      status: "partial",
      detail: `${clippedPairs}/${sideStates.length} eye side(s) are clipped correctly.`,
    };
  }
  return {
    id: "eyeClipping",
    label: "Eye clipping",
    status: sideStates.some((state) => !state.validPair) ? "blocked" : "pending",
    detail: sideStates.some((state) => !state.validPair)
      ? "Imported eye parts are incomplete or ambiguous."
      : "Eye pairs are present but clipping has not been applied yet.",
  };
}

function hasEyeRigSide(project: ProjectData, side: EyeSide) {
  const prefix = `seeThroughEyeControl:v1:${side}:`;
  const parameterReady = project.parameters.some(
    (parameter) => parameter.managedTag === `${prefix}parameter`,
  );
  const controlBoneReady = flattenLayers(project.layers).some(
    (layer) => isBone(layer) && layer.managedTag === `${prefix}controlBone`,
  );
  return parameterReady && controlBoneReady;
}

function buildEyeRigItem(
  importedViviMeshes: readonly ViviMeshNode[],
  project: ProjectData,
): SeeThroughSetupChecklistItem {
  const sideStates = (["left", "right"] as const)
    .map((side) => ({ side, ...resolveEyeSideState(importedViviMeshes, side) }))
    .filter((state) => state.applicable);
  if (sideStates.length === 0) {
    return {
      id: "eyeRig",
      label: "Eye rig",
      status: "na",
      detail: "No imported eye parts were found.",
    };
  }

  const readySides = sideStates.filter((state) => state.validPair && state.clipped);
  const completedSides = readySides.filter((state) =>
    hasEyeRigSide(project, state.side),
  ).length;

  if (readySides.length === 0) {
    return {
      id: "eyeRig",
      label: "Eye rig",
      status: "blocked",
      detail: "Finish eye clipping before creating the eye rig.",
    };
  }
  if (completedSides === readySides.length && readySides.length === sideStates.length) {
    return {
      id: "eyeRig",
      label: "Eye rig",
      status: "done",
      detail: `${completedSides}/${readySides.length} ready eye side(s) have managed controls.`,
    };
  }
  if (completedSides > 0) {
    return {
      id: "eyeRig",
      label: "Eye rig",
      status: "partial",
      detail: `${completedSides}/${readySides.length} ready eye side(s) have managed controls.`,
    };
  }
  if (readySides.length < sideStates.length) {
    return {
      id: "eyeRig",
      label: "Eye rig",
      status: "blocked",
      detail: "Some eye sides are still missing valid clipped pairs.",
    };
  }
  return {
    id: "eyeRig",
    label: "Eye rig",
    status: "pending",
    detail: "Eye clipping is ready, but the eye rig has not been created yet.",
  };
}

function buildMouthRigItem(
  importedViviMeshes: readonly ViviMeshNode[],
  project: ProjectData,
): SeeThroughSetupChecklistItem {
  const mouthLayers = importedViviMeshes.filter(
    (layer) =>
      normalizeLabel(getSeeThroughImportMetadata(layer.importMetadata)?.label) ===
      "mouth",
  );
  if (mouthLayers.length === 0) {
    return {
      id: "mouthRig",
      label: "Mouth rig",
      status: "na",
      detail: "No imported mouth layer was found.",
    };
  }
  if (mouthLayers.length !== 1) {
    return {
      id: "mouthRig",
      label: "Mouth rig",
      status: "blocked",
      detail: `${mouthLayers.length} imported mouth layers were found.`,
    };
  }

  const parameterReady = project.parameters.some(
    (parameter) => parameter.managedTag === "seeThroughMouthControl:v1:parameter",
  );
  const controlBoneReady = flattenLayers(project.layers).some(
    (layer) =>
      isBone(layer) &&
      layer.managedTag === "seeThroughMouthControl:v1:controlBone",
  );

  if (parameterReady && controlBoneReady) {
    return {
      id: "mouthRig",
      label: "Mouth rig",
      status: "done",
      detail: "The managed mouth controls are present.",
    };
  }

  return {
    id: "mouthRig",
    label: "Mouth rig",
    status: "pending",
    detail: "A single imported mouth layer is ready for control creation.",
  };
}

export function summarizeSeeThroughSecondaryPhysics(
  importedViviMeshes: readonly ViviMeshNode[],
  project: ProjectData,
): SeeThroughSecondaryPhysicsSummary {
  const applicable = importedViviMeshes.some(
    (layer) => layer.semanticRole && HAIR_LIKE_ROLES.has(layer.semanticRole),
  );
  if (!applicable) {
    return {
      applicable: false,
      status: "na",
      detail: "No imported hair-like layers were found.",
    };
  }

  const managedGroups = project.physicsGroups.filter((group) =>
    group.managedTag?.startsWith("hairStrandHelper:v1:tip="),
  ).length;
  if (managedGroups > 0) {
    return {
      applicable: true,
      status: "done",
      detail: `${managedGroups} managed hair strand helper(s) exist.`,
    };
  }
  if (project.physicsGroups.length > 0) {
    return {
      applicable: true,
      status: "partial",
      detail: `${project.physicsGroups.length} physics group(s) exist, but none are managed hair helpers.`,
    };
  }
  return {
    applicable: true,
    status: "pending",
    detail: "No secondary physics helpers exist yet.",
  };
}

function buildPhysicsItem(
  importedViviMeshes: readonly ViviMeshNode[],
  project: ProjectData,
): SeeThroughSetupChecklistItem {
  const summary = summarizeSeeThroughSecondaryPhysics(importedViviMeshes, project);
  return {
    id: "physics",
    label: "Secondary physics",
    status: summary.status,
    detail: summary.detail,
  };
}

export function buildSeeThroughSetupChecklist(
  project: ProjectData,
  depthRigHintSummary?: SeeThroughDepthRigHintSummary | null,
  locale: SetupChecklistLocale = "en",
): SeeThroughSetupChecklistSummary {
  const importedViviMeshes = listImportedViviMeshes(project);
  if (importedViviMeshes.length === 0) {
    return { isSeeThroughProject: false, items: [] };
  }

  const items = [
      buildCleanupItem(importedViviMeshes),
      buildRolesItem(project),
      buildMeshItem(importedViviMeshes),
      buildDepthItem(depthRigHintSummary),
      buildEyeClippingItem(importedViviMeshes),
      buildEyeRigItem(importedViviMeshes, project),
      buildMouthRigItem(importedViviMeshes, project),
      buildPhysicsItem(importedViviMeshes, project),
    ];

  return {
    isSeeThroughProject: true,
    items: localizeChecklistItems(items, locale),
  };
}
