import { flattenLayers } from "@vivi2d/core/layer-utils";
import { MAX_PSD_LAYER_PIXELS } from "@vivi2d/core/load-limits";
import type { LayerNode, ProjectData } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import { stripSeeThroughTechnicalName } from "./see-through-technical-name";

export interface PsdReimportLeafInput {
  token: string | null;
  displayName: string;
  left: number;
  top: number;
  width: number;
  height: number;
  hasPixels: boolean;
}

export interface PsdReimportTextureSize {
  width: number;
  height: number;
}

export type PsdReimportHoldReason =
  | "incoming-name-ambiguous"
  | "existing-name-ambiguous"
  | "token-ambiguous"
  | "target-conflict"
  | "unsupported-target"
  | "missing-pixels"
  | "missing-texture"
  | "invalid-dimensions"
  | "aspect-ratio-change";

export interface PsdReimportPlanEntry {
  leafIndex: number;
  nodeId?: string;
  nodeName: string;
  status: "eligible" | "needs-confirmation" | "held" | "unmatched";
  reason?: PsdReimportHoldReason;
  matchedBy?: "token" | "name";
  oldWidth?: number;
  oldHeight?: number;
  newWidth: number;
  newHeight: number;
  sourceLeft: number;
  sourceTop: number;
  nextToken?: string;
}

export interface PsdReimportPlan {
  readonly entries: readonly Readonly<PsdReimportPlanEntry>[];
  readonly removed: readonly Readonly<{ nodeId: string; nodeName: string }>[];
}

export interface PsdReimportTextureTarget {
  layerId: string;
  leafIndex: number;
}

export interface PsdReimportApplyResult {
  updatedTextureTargets: PsdReimportTextureTarget[];
  metadataChangedLayerIds: string[];
}

function getNodeToken(node: LayerNode): string | undefined {
  return node.importMetadata?.source === "seeThrough"
    ? node.importMetadata.seeThrough.psdLeafToken
    : undefined;
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_PSD_LAYER_PIXELS &&
    height <= MAX_PSD_LAYER_PIXELS &&
    width * height <= MAX_PSD_LAYER_PIXELS
  );
}

function buildPlan(
  project: ProjectData,
  leaves: readonly PsdReimportLeafInput[],
  textureSizes: ReadonlyMap<string, PsdReimportTextureSize>,
): PsdReimportPlan {
  const nodes = flattenLayers(project.layers);
  const names = new Map<string, LayerNode[]>();
  const tokens = new Map<string, LayerNode[]>();
  const nodeIdCounts = new Map<string, number>();
  for (const node of nodes) {
    const name = stripSeeThroughTechnicalName(node.name);
    const nameNodes = names.get(name) ?? [];
    nameNodes.push(node);
    names.set(name, nameNodes);
    nodeIdCounts.set(node.id, (nodeIdCounts.get(node.id) ?? 0) + 1);
    const token = getNodeToken(node);
    if (token) {
      const tokenNodes = tokens.get(token) ?? [];
      tokenNodes.push(node);
      tokens.set(token, tokenNodes);
    }
  }
  const incomingNames = new Map<string, number>();
  const incomingTokens = new Map<string, number>();
  // Include missing-raster records in collision counts: excluding one must not
  // make an otherwise ambiguous source association overwrite a drawable node.
  for (const leaf of leaves) {
    const name = stripSeeThroughTechnicalName(leaf.displayName);
    incomingNames.set(name, (incomingNames.get(name) ?? 0) + 1);
    if (leaf.token)
      incomingTokens.set(leaf.token, (incomingTokens.get(leaf.token) ?? 0) + 1);
  }

  const entries = leaves.map((leaf, leafIndex): PsdReimportPlanEntry => {
    const name = stripSeeThroughTechnicalName(leaf.displayName);
    const entry: PsdReimportPlanEntry = {
      leafIndex,
      nodeName: leaf.displayName,
      status: "unmatched",
      newWidth: leaf.width,
      newHeight: leaf.height,
      sourceLeft: leaf.left,
      sourceTop: leaf.top,
    };
    const tokenNodes = leaf.token ? (tokens.get(leaf.token) ?? []) : [];
    const nameNodes = names.get(name) ?? [];
    let node: LayerNode | undefined;
    if (leaf.token && incomingTokens.get(leaf.token) === 1 && tokenNodes.length === 1) {
      node = tokenNodes[0];
      entry.matchedBy = "token";
    } else if (incomingNames.get(name) === 1 && nameNodes.length === 1) {
      node = nameNodes[0];
      entry.matchedBy = "name";
    } else {
      if ((incomingNames.get(name) ?? 0) > 1) {
        entry.reason = "incoming-name-ambiguous";
      } else if (nameNodes.length > 1) {
        entry.reason = "existing-name-ambiguous";
      } else if (
        leaf.token &&
        ((incomingTokens.get(leaf.token) ?? 0) > 1 || tokenNodes.length > 1)
      ) {
        entry.reason = "token-ambiguous";
      }
      if (entry.reason) entry.status = "held";
      return entry;
    }
    if (!node) return entry;
    entry.nodeId = node.id;
    entry.nodeName = node.name;
    const oldSize = textureSizes.get(node.id);
    entry.oldWidth = oldSize?.width;
    entry.oldHeight = oldSize?.height;
    entry.status = "held";
    if ((nodeIdCounts.get(node.id) ?? 0) !== 1) entry.reason = "target-conflict";
    else if (!isViviMesh(node)) entry.reason = "unsupported-target";
    else if (!leaf.hasPixels) entry.reason = "missing-pixels";
    else if (!oldSize) entry.reason = "missing-texture";
    else if (
      !validDimensions(oldSize.width, oldSize.height) ||
      !validDimensions(leaf.width, leaf.height)
    ) {
      entry.reason = "invalid-dimensions";
    } else if (oldSize.width * leaf.height !== leaf.width * oldSize.height) {
      entry.reason = "aspect-ratio-change";
    } else {
      entry.status =
        oldSize.width === leaf.width && oldSize.height === leaf.height
          ? "eligible"
          : "needs-confirmation";
      if (
        entry.matchedBy === "name" &&
        leaf.token &&
        incomingTokens.get(leaf.token) === 1 &&
        tokenNodes.every((candidate) => candidate.id === node.id) &&
        node.importMetadata?.source === "seeThrough" &&
        getNodeToken(node) !== leaf.token
      )
        entry.nextToken = leaf.token;
    }
    return entry;
  });

  const targetCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.nodeId)
      targetCounts.set(entry.nodeId, (targetCounts.get(entry.nodeId) ?? 0) + 1);
  }
  for (const entry of entries) {
    if (entry.nodeId && (targetCounts.get(entry.nodeId) ?? 0) > 1) {
      entry.status = "held";
      entry.reason = "target-conflict";
      delete entry.nextToken;
    }
  }
  return {
    entries,
    removed: nodes
      .filter((node) => {
        const token = getNodeToken(node);
        return (
          isViviMesh(node) &&
          !targetCounts.has(node.id) &&
          !incomingNames.has(stripSeeThroughTechnicalName(node.name)) &&
          !(token && incomingTokens.has(token))
        );
      })
      .map((node) => ({ nodeId: node.id, nodeName: node.name })),
  };
}

export function planPsdReimport(
  project: ProjectData,
  leaves: readonly PsdReimportLeafInput[],
  textureSizes: ReadonlyMap<string, PsdReimportTextureSize>,
): PsdReimportPlan {
  const plan = buildPlan(project, leaves, textureSizes);
  return Object.freeze({
    entries: Object.freeze(plan.entries.map((entry) => Object.freeze(entry))),
    removed: Object.freeze(plan.removed.map((entry) => Object.freeze(entry))),
  });
}

/**
 * Validate the whole selection before changing only permitted token metadata.
 * The adapter retains this plan and owns live project/texture/history freshness.
 * Selection never reruns matching or resolves an ambiguous association.
 */
export function applyPsdReimportLeaves(
  project: ProjectData,
  leaves: readonly PsdReimportLeafInput[],
  plan: PsdReimportPlan,
  selectedLeafIndices: readonly number[],
  confirmedResolutionLeafIndices: readonly number[],
): PsdReimportApplyResult {
  const selected = new Set(selectedLeafIndices);
  const confirmed = new Set(confirmedResolutionLeafIndices);
  if (
    selected.size !== selectedLeafIndices.length ||
    confirmed.size !== confirmedResolutionLeafIndices.length
  ) {
    throw new Error("PSD reimport selection is invalid.");
  }
  const nodes = flattenLayers(project.layers);
  const selectedEntries = selectedLeafIndices.map((index) => {
    const entry =
      Number.isSafeInteger(index) && index >= 0 ? plan.entries[index] : undefined;
    if (
      !entry?.nodeId ||
      entry.leafIndex !== index ||
      (entry.status !== "eligible" && entry.status !== "needs-confirmation")
    ) {
      throw new Error("PSD reimport selection is invalid.");
    }
    if (entry.status === "needs-confirmation" && !confirmed.has(index)) {
      throw new Error("PSD reimport resolution confirmation is required.");
    }
    const leaf = leaves[index];
    const targets = nodes.filter((node) => node.id === entry.nodeId);
    const node = targets[0];
    if (
      !leaf?.hasPixels ||
      leaf.width !== entry.newWidth ||
      leaf.height !== entry.newHeight ||
      !validDimensions(leaf.width, leaf.height) ||
      targets.length !== 1 ||
      !node ||
      !isViviMesh(node) ||
      (entry.matchedBy === "token"
        ? getNodeToken(node) !== leaf.token
        : entry.matchedBy !== "name" ||
          stripSeeThroughTechnicalName(node.name) !==
            stripSeeThroughTechnicalName(leaf.displayName))
    )
      throw new Error("PSD reimport preview is stale.");
    return { entry, node, leaf };
  });
  for (const index of confirmed) {
    if (!selected.has(index) || plan.entries[index]?.status !== "needs-confirmation") {
      throw new Error("PSD reimport resolution confirmation is invalid.");
    }
  }
  const plannedTokens = new Set<string>();
  const tokenChanges = selectedEntries.flatMap(({ entry, node, leaf }) => {
    if (!entry.nextToken) return [];
    if (
      entry.matchedBy !== "name" ||
      leaf.token !== entry.nextToken ||
      node.importMetadata?.source !== "seeThrough" ||
      leaves.filter((candidate) => candidate.token === entry.nextToken).length !== 1 ||
      nodes.some(
        (candidate) =>
          candidate.id !== node.id && getNodeToken(candidate) === entry.nextToken,
      ) ||
      plannedTokens.has(entry.nextToken)
    ) {
      throw new Error("PSD reimport preview is stale.");
    }
    plannedTokens.add(entry.nextToken);
    if (getNodeToken(node) === entry.nextToken) return [];
    return [
      {
        layerId: node.id,
        metadata: node.importMetadata.seeThrough,
        token: entry.nextToken,
      },
    ];
  });
  for (const change of tokenChanges) change.metadata.psdLeafToken = change.token;
  return {
    updatedTextureTargets: selectedEntries.map(({ entry, node }) => ({
      layerId: node.id,
      leafIndex: entry.leafIndex,
    })),
    metadataChangedLayerIds: tokenChanges.map((change) => change.layerId),
  };
}
