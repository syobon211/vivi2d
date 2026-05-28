import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerNode, LayerSemanticRole, ProjectData } from "@vivi2d/core/types";
import { getSeeThroughImportMetadata, isViviMesh } from "@vivi2d/core/types";
import type { SeeThroughQualityReport } from "./see-through-quality-report";

export type SeeThroughDepthRigHintSeverity = "info" | "warning";
export type SeeThroughDepthRigHintConcern =
  | "cleanupOrder"
  | "faceRig"
  | "meshControl"
  | "physicsPriority";
export type SeeThroughDepthRigHintMessageKey =
  | "seethrough.depthRig.blockingQualityErrors"
  | "seethrough.depthRig.cleanupUnknownRole"
  | "seethrough.depthRig.coarseBackLayer"
  | "seethrough.depthRig.eyeRigReady"
  | "seethrough.depthRig.frontFineControl"
  | "seethrough.depthRig.incompleteEyebrowFamily"
  | "seethrough.depthRig.incompleteEyeFamily"
  | "seethrough.depthRig.mouthRigReady"
  | "seethrough.depthRig.physicsBackLayer";

export interface SeeThroughDepthRigHint {
  code: string;
  concern: SeeThroughDepthRigHintConcern;
  severity: SeeThroughDepthRigHintSeverity;
  blocking?: boolean;
  layerId?: string;
  messageKey: SeeThroughDepthRigHintMessageKey;
  messageParams?: Record<string, string | number>;
}

export interface SeeThroughDepthRigHintSummary {
  isSeeThroughProject: boolean;
  hints: SeeThroughDepthRigHint[];
  counts: {
    info: number;
    warning: number;
    blocking: number;
  };
}

interface ImportedSeeThroughLayer {
  id: string;
  name: string;
  semanticRole?: LayerSemanticRole;
  confidence: number;
  frontBackSplit: "front" | "back" | "middle" | "unknown";
}

const CONCERN_ORDER: readonly SeeThroughDepthRigHintConcern[] = [
  "cleanupOrder",
  "faceRig",
  "meshControl",
  "physicsPriority",
];

function compareStableText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
const SIDE_FAMILIES: ReadonlyArray<{
  left: LayerSemanticRole;
  right: LayerSemanticRole;
  messageKey:
    | "seethrough.depthRig.incompleteEyeFamily"
    | "seethrough.depthRig.incompleteEyebrowFamily";
}> = [
  {
    left: "eyeLeft",
    right: "eyeRight",
    messageKey: "seethrough.depthRig.incompleteEyeFamily",
  },
  {
    left: "eyebrowLeft",
    right: "eyebrowRight",
    messageKey: "seethrough.depthRig.incompleteEyebrowFamily",
  },
];

function listImportedSeeThroughLayers(project: ProjectData): ImportedSeeThroughLayer[] {
  return flattenLayers(project.layers)
    .filter((layer): layer is LayerNode => isViviMesh(layer))
    .filter((layer) => layer.importMetadata?.source === "seeThrough")
    .map((layer) => {
      const metadata = getSeeThroughImportMetadata(layer.importMetadata);
      if (!metadata) {
        throw new Error("Expected see-through import metadata for depth rig hints.");
      }
      return {
        id: layer.id,
        name: layer.name,
        semanticRole: layer.semanticRole,
        confidence: metadata.confidence,
        frontBackSplit: metadata.frontBackSplit,
      };
    });
}

function pushHint(
  target: SeeThroughDepthRigHint[],
  hint: SeeThroughDepthRigHint,
  seen: Set<string>,
): void {
  const dedupeKey = `${hint.code}:${hint.layerId ?? "project"}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  target.push(hint);
}

function shouldSuppressAdvisoryHint(layer: ImportedSeeThroughLayer): boolean {
  return layer.confidence < 0.5;
}

function buildLayerHints(
  layers: ImportedSeeThroughLayer[],
  hints: SeeThroughDepthRigHint[],
  seen: Set<string>,
): void {
  for (const layer of layers) {
    if (
      (layer.semanticRole == null || layer.semanticRole === "unknown") &&
      layer.confidence >= 0.5
    ) {
      pushHint(
        hints,
        {
          code: "cleanupUnknownRole",
          concern: "cleanupOrder",
          severity: "warning",
          layerId: layer.id,
          messageKey: "seethrough.depthRig.cleanupUnknownRole",
          messageParams: { layerName: layer.name },
        },
        seen,
      );
    }

    if (shouldSuppressAdvisoryHint(layer)) continue;

    if (
      layer.semanticRole === "hairFront" ||
      (layer.semanticRole === "accessory" && layer.frontBackSplit === "front")
    ) {
      pushHint(
        hints,
        {
          code: "frontFineControl",
          concern: "meshControl",
          severity: "info",
          layerId: layer.id,
          messageKey: "seethrough.depthRig.frontFineControl",
          messageParams: { layerName: layer.name },
        },
        seen,
      );
    }

    if (
      layer.semanticRole === "hairBack" ||
      (layer.semanticRole === "accessory" && layer.frontBackSplit === "back")
    ) {
      pushHint(
        hints,
        {
          code: "coarseBackLayer",
          concern: "meshControl",
          severity: "info",
          layerId: layer.id,
          messageKey: "seethrough.depthRig.coarseBackLayer",
          messageParams: { layerName: layer.name },
        },
        seen,
      );
      pushHint(
        hints,
        {
          code: "physicsBackLayer",
          concern: "physicsPriority",
          severity: "info",
          layerId: layer.id,
          messageKey: "seethrough.depthRig.physicsBackLayer",
          messageParams: { layerName: layer.name },
        },
        seen,
      );
    }

    if (layer.semanticRole === "tail") {
      pushHint(
        hints,
        {
          code: "physicsBackLayer",
          concern: "physicsPriority",
          severity: "info",
          layerId: layer.id,
          messageKey: "seethrough.depthRig.physicsBackLayer",
          messageParams: { layerName: layer.name },
        },
        seen,
      );
    }
  }
}

function buildProjectHints(
  layers: ImportedSeeThroughLayer[],
  qualityReport: SeeThroughQualityReport | null | undefined,
  hints: SeeThroughDepthRigHint[],
  seen: Set<string>,
): void {
  if ((qualityReport?.errorCount ?? 0) > 0) {
    pushHint(
      hints,
      {
        code: "blockingQualityErrors",
        concern: "cleanupOrder",
        severity: "warning",
        blocking: true,
        messageKey: "seethrough.depthRig.blockingQualityErrors",
        messageParams: { count: qualityReport!.errorCount },
      },
      seen,
    );
  }

  const roles = new Set(layers.map((layer) => layer.semanticRole).filter(Boolean));
  if (roles.has("eyeLeft") && roles.has("eyeRight")) {
    pushHint(
      hints,
      {
        code: "eyeRigReady",
        concern: "faceRig",
        severity: "info",
        messageKey: "seethrough.depthRig.eyeRigReady",
      },
      seen,
    );
  }
  if (roles.has("mouth")) {
    pushHint(
      hints,
      {
        code: "mouthRigReady",
        concern: "faceRig",
        severity: "info",
        messageKey: "seethrough.depthRig.mouthRigReady",
      },
      seen,
    );
  }

  for (const family of SIDE_FAMILIES) {
    const hasLeft = roles.has(family.left);
    const hasRight = roles.has(family.right);
    if (hasLeft !== hasRight) {
      pushHint(
        hints,
        {
          code: family.messageKey,
          concern: "faceRig",
          severity: "warning",
          messageKey: family.messageKey,
        },
        seen,
      );
    }
  }
}

function sortHints(hints: SeeThroughDepthRigHint[]): SeeThroughDepthRigHint[] {
  const concernIndex = new Map(CONCERN_ORDER.map((concern, index) => [concern, index]));
  const severityRank = (hint: SeeThroughDepthRigHint): number => {
    if (hint.blocking) return 0;
    return hint.severity === "warning" ? 1 : 2;
  };

  return [...hints].sort((a, b) => {
    const concernDelta =
      (concernIndex.get(a.concern) ?? Number.MAX_SAFE_INTEGER) -
      (concernIndex.get(b.concern) ?? Number.MAX_SAFE_INTEGER);
    if (concernDelta !== 0) return concernDelta;

    const severityDelta = severityRank(a) - severityRank(b);
    if (severityDelta !== 0) return severityDelta;

    const nameA = String(a.messageParams?.layerName ?? "");
    const nameB = String(b.messageParams?.layerName ?? "");
    return compareStableText(nameA, nameB) || compareStableText(a.code, b.code);
  });
}

export function buildSeeThroughDepthRigHintSummary(
  project: ProjectData,
  qualityReport?: SeeThroughQualityReport | null,
): SeeThroughDepthRigHintSummary {
  const layers = listImportedSeeThroughLayers(project);
  if (layers.length === 0) {
    return {
      isSeeThroughProject: false,
      hints: [],
      counts: { info: 0, warning: 0, blocking: 0 },
    };
  }

  const hints: SeeThroughDepthRigHint[] = [];
  const seen = new Set<string>();
  buildProjectHints(layers, qualityReport, hints, seen);
  buildLayerHints(layers, hints, seen);

  const sortedHints = sortHints(hints);
  let info = 0;
  let warning = 0;
  let blocking = 0;
  for (const hint of sortedHints) {
    if (hint.blocking) blocking += 1;
    else if (hint.severity === "warning") warning += 1;
    else info += 1;
  }

  return {
    isSeeThroughProject: true,
    hints: sortedHints,
    counts: {
      info,
      warning,
      blocking,
    },
  };
}
