import { MESH_DEFAULTS } from "@vivi2d/core/constants";
import { findLayerById, flattenLayers } from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type { BlendMode, LayerNode, ProjectData, ViviMeshNode } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";

export interface PsdReimportDiff {
  updated: { nodeId: string; nodeName: string }[];
  added: { nodeName: string }[];
  removed: { nodeId: string; nodeName: string }[];
}

export interface PsdReimportLeafInput {
  token: string | null;
  displayName: string;
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  hasPixels: boolean;
}

export interface PsdReimportUpdatedPlanEntry {
  nodeId: string;
  nodeName: string;
  leafIndex: number;
  matchedBy: "token" | "name";
}

export interface PsdReimportAddedPlanEntry {
  nodeName: string;
  leafIndex: number;
}

export interface PsdReimportPlan {
  updated: PsdReimportUpdatedPlanEntry[];
  added: PsdReimportAddedPlanEntry[];
  removed: { nodeId: string; nodeName: string }[];
  diff: PsdReimportDiff;
}

export interface PsdReimportTextureTarget {
  layerId: string;
  leafIndex: number;
}

export interface PsdReimportApplyResult {
  diff: PsdReimportDiff;
  updatedTextureTargets: PsdReimportTextureTarget[];
  addedTextureTargets: PsdReimportTextureTarget[];
}

interface MatchResult {
  match: LayerNode | undefined;
  matchedBy: "token" | "name" | null;
}

interface PsdReimportContext {
  existingFlat: LayerNode[];
  nameToNodes: Map<string, LayerNode[]>;
  tokenToNodes: Map<string, LayerNode[]>;
  duplicateTokens: Set<string>;
  duplicateExistingTokens: Set<string>;
}

function buildNameToNodesMap(existingFlat: LayerNode[]): Map<string, LayerNode[]> {
  const nameToNodes = new Map<string, LayerNode[]>();
  for (const node of existingFlat) {
    const list = nameToNodes.get(node.name) ?? [];
    list.push(node);
    nameToNodes.set(node.name, list);
  }
  return nameToNodes;
}

function buildTokenToNodesMap(existingFlat: LayerNode[]): Map<string, LayerNode[]> {
  const tokenToNodes = new Map<string, LayerNode[]>();
  for (const node of existingFlat) {
    if (!isViviMesh(node)) continue;
    if (node.importMetadata?.source !== "seeThrough") continue;
    const token = node.importMetadata.seeThrough.psdLeafToken;
    if (!token) continue;
    const list = tokenToNodes.get(token) ?? [];
    list.push(node);
    tokenToNodes.set(token, list);
  }
  return tokenToNodes;
}

function buildDuplicatePsdTokens(leaves: PsdReimportLeafInput[]): Set<string> {
  const tokenCounts = new Map<string, number>();
  for (const leaf of leaves) {
    if (!leaf.token) continue;
    tokenCounts.set(leaf.token, (tokenCounts.get(leaf.token) ?? 0) + 1);
  }

  return new Set(
    [...tokenCounts.entries()].filter(([, count]) => count > 1).map(([token]) => token),
  );
}

function buildDuplicateExistingTokens(
  tokenToNodes: Map<string, LayerNode[]>,
): Set<string> {
  return new Set(
    [...tokenToNodes.entries()]
      .filter(([, nodes]) => nodes.length > 1)
      .map(([token]) => token),
  );
}

function findLeafMatch(
  leaf: PsdReimportLeafInput,
  nameToNodes: Map<string, LayerNode[]>,
  tokenToNodes: Map<string, LayerNode[]>,
  matchedIds: Set<string>,
  duplicateTokens: Set<string>,
  duplicateExistingTokens: Set<string>,
): MatchResult {
  if (
    leaf.token &&
    !duplicateTokens.has(leaf.token) &&
    !duplicateExistingTokens.has(leaf.token)
  ) {
    const tokenCandidates = tokenToNodes.get(leaf.token);
    const tokenMatch = tokenCandidates?.find(
      (candidate) => !matchedIds.has(candidate.id),
    );
    if (tokenMatch) return { match: tokenMatch, matchedBy: "token" };
  }

  const nameCandidates = nameToNodes.get(leaf.displayName);
  const nameMatch = nameCandidates?.find((candidate) => !matchedIds.has(candidate.id));
  if (nameMatch) return { match: nameMatch, matchedBy: "name" };

  return { match: undefined, matchedBy: null };
}

function maybeBackfillSeeThroughToken(
  node: LayerNode,
  token: string,
  tokenToNodes: Map<string, LayerNode[]>,
  duplicateExistingTokens: Set<string>,
): void {
  if (!isViviMesh(node)) return;
  if (node.importMetadata?.source !== "seeThrough") return;
  if (duplicateExistingTokens.has(token)) return;
  const existing = tokenToNodes.get(token);
  if (existing?.some((candidate) => candidate.id !== node.id)) return;
  node.importMetadata.seeThrough.psdLeafToken = token;
}

function updateMatchedLayerFromPsdLeaf(match: LayerNode, leaf: PsdReimportLeafInput): void {
  match.x = leaf.left;
  match.y = leaf.top;
  match.width = leaf.width;
  match.height = leaf.height;

  if (!isViviMesh(match)) return;

  const oldVertexCount = match.mesh.vertices.length;
  const newMesh = generateGridMesh(
    leaf.width,
    leaf.height,
    match.mesh.divisionsX,
    match.mesh.divisionsY,
  );
  if (newMesh.vertices.length !== oldVertexCount) {
    match.mesh = newMesh;
  }
}

function createAddedLayerFromPsdLeaf(
  leaf: PsdReimportLeafInput,
  layerId: string,
): LayerNode {
  const base = {
    id: layerId,
    name: leaf.displayName,
    visible: leaf.visible,
    opacity: leaf.opacity,
    x: leaf.left,
    y: leaf.top,
    width: leaf.width,
    height: leaf.height,
    blendMode: leaf.blendMode,
    expanded: true,
    children: [],
  };

  if (!leaf.hasPixels) {
    return {
      ...base,
      kind: "group",
    };
  }

  return {
    ...base,
    kind: "viviMesh",
    mesh: generateGridMesh(
      leaf.width,
      leaf.height,
      MESH_DEFAULTS.DIVISIONS_X,
      MESH_DEFAULTS.DIVISIONS_Y,
    ),
  } satisfies ViviMeshNode;
}

function buildPsdReimportContext(
  project: ProjectData,
  leaves: PsdReimportLeafInput[],
): PsdReimportContext {
  const existingFlat = flattenLayers(project.layers);
  const nameToNodes = buildNameToNodesMap(existingFlat);
  const tokenToNodes = buildTokenToNodesMap(existingFlat);
  return {
    existingFlat,
    nameToNodes,
    tokenToNodes,
    duplicateTokens: buildDuplicatePsdTokens(leaves),
    duplicateExistingTokens: buildDuplicateExistingTokens(tokenToNodes),
  };
}

function planPsdReimportWithContext(
  leaves: PsdReimportLeafInput[],
  context: PsdReimportContext,
): PsdReimportPlan {
  const matchedIds = new Set<string>();
  const updated: PsdReimportUpdatedPlanEntry[] = [];
  const added: PsdReimportAddedPlanEntry[] = [];
  const removed: { nodeId: string; nodeName: string }[] = [];

  leaves.forEach((leaf, leafIndex) => {
    const { match, matchedBy } = findLeafMatch(
      leaf,
      context.nameToNodes,
      context.tokenToNodes,
      matchedIds,
      context.duplicateTokens,
      context.duplicateExistingTokens,
    );

    if (match && matchedBy) {
      matchedIds.add(match.id);
      updated.push({
        nodeId: match.id,
        nodeName: match.name,
        leafIndex,
        matchedBy,
      });
      return;
    }

    added.push({ nodeName: leaf.displayName, leafIndex });
  });

  for (const node of context.existingFlat) {
    if (!isViviMesh(node)) continue;
    if (!matchedIds.has(node.id)) {
      removed.push({ nodeId: node.id, nodeName: node.name });
    }
  }

  return {
    updated,
    added,
    removed,
    diff: {
      updated: updated.map(({ nodeId, nodeName }) => ({ nodeId, nodeName })),
      added: added.map(({ nodeName }) => ({ nodeName })),
      removed,
    },
  };
}

export function planPsdReimport(
  project: ProjectData,
  leaves: PsdReimportLeafInput[],
): PsdReimportPlan {
  return planPsdReimportWithContext(leaves, buildPsdReimportContext(project, leaves));
}

export function applyPsdReimportLeaves(
  project: ProjectData,
  leaves: PsdReimportLeafInput[],
  options: {
    createLayerId: (leaf: PsdReimportLeafInput, leafIndex: number) => string;
  },
): PsdReimportApplyResult {
  const context = buildPsdReimportContext(project, leaves);
  const plan = planPsdReimportWithContext(leaves, context);
  const updatedTextureTargets: PsdReimportTextureTarget[] = [];
  const addedTextureTargets: PsdReimportTextureTarget[] = [];

  for (const entry of plan.updated) {
    const leaf = leaves[entry.leafIndex];
    const layer = findLayerById(project.layers, entry.nodeId);
    if (!leaf || !layer) continue;
    if (
      entry.matchedBy === "name" &&
      leaf.token != null &&
      !context.duplicateTokens.has(leaf.token)
    ) {
      maybeBackfillSeeThroughToken(
        layer,
        leaf.token,
        context.tokenToNodes,
        context.duplicateExistingTokens,
      );
    }
    updateMatchedLayerFromPsdLeaf(layer, leaf);
    if (leaf.hasPixels) {
      updatedTextureTargets.push({ layerId: entry.nodeId, leafIndex: entry.leafIndex });
    }
  }

  for (const entry of plan.added) {
    const leaf = leaves[entry.leafIndex];
    if (!leaf) continue;
    const layerId = options.createLayerId(leaf, entry.leafIndex);
    project.layers.push(createAddedLayerFromPsdLeaf(leaf, layerId));
    if (leaf.hasPixels) {
      addedTextureTargets.push({ layerId, leafIndex: entry.leafIndex });
    }
  }

  return {
    diff: plan.diff,
    updatedTextureTargets,
    addedTextureTargets,
  };
}
