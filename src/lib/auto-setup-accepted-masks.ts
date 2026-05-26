import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerRiggingHint, ProjectData } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import {
  createAcceptedMaskPacketRegistry,
  createProtectedRegionSetHash,
} from "@vivi2d/editor-core/accepted-mask-packet";
import {
  createLocalMotionAcceptedMaskFingerprint,
  type LocalMotionAcceptedManualMask,
  type LocalMotionAcceptedManualMaskMap,
} from "@vivi2d/editor-core/motion-handles";
import { getMotionSemanticPolicy } from "@vivi2d/editor-core/motion-template-policy";
import { createStableAutoSetupHash } from "@vivi2d/editor-core/safe-auto-setup-plan";

export function createAutoSetupAcceptedManualMasks(
  project: ProjectData,
  getTexture: (layerId: string) => HTMLCanvasElement | undefined,
): LocalMotionAcceptedManualMaskMap {
  const allLayers = flattenLayers(project.layers);
  const protectedRegions = allLayers
    .filter((layer) => isViviMesh(layer))
    .filter((layer) => getMotionSemanticPolicy(layer.semanticRole ?? "unknown").protected)
    .map((layer) => ({
      id: layer.id,
      role: layer.semanticRole ?? "unknown",
      bounds: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
      cropGeneration: createProtectedCropGeneration(layer),
    }));
  const protectedRegionSetRevision = createStableAutoSetupHash({
    kind: "protectedRegionSetRevision",
    protectedRegions,
  });
  const packetCandidates = allLayers.flatMap((layer) => {
    if (!isViviMesh(layer)) return [];
    const metadata = layer.manualSplitOutputMetadata;
    if (metadata?.kind !== "maskExtractedLayer") return [];
    const canvas = getTexture(layer.id);
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return [];
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    const sourceCanvas = getTexture(metadata.manualSplitSourceLayerId);
    if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return [];
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return [];
    let imageData: ImageData;
    let sourceImageData: ImageData;
    try {
      imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      sourceImageData = sourceContext.getImageData(
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
      );
    } catch {
      return [];
    }
    const alpha = Uint8Array.from(
      { length: canvas.width * canvas.height },
      (_, index) => imageData.data[index * 4 + 3] ?? 0,
    );
    const fingerprint = createLocalMotionAcceptedMaskFingerprint(
      canvas.width,
      canvas.height,
      alpha,
    );
    if (!fingerprint) return [];
    const sourceLayerRevision = createStableAutoSetupHash({
      kind: "acceptedMaskSourceLayerRevision",
      layerId: layer.id,
      sourceLayerId: metadata.manualSplitSourceLayerId,
      sourceFingerprint: metadata.manualSplitSourceFingerprint,
      layerBounds: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
      manualSplitLayerId: metadata.manualSplitLayerId,
      manualSplitMaskId: metadata.manualSplitMaskId,
    });
    const sourceTextureRevision = createStableAutoSetupHash({
      kind: "acceptedMaskTextureRevision",
      layerId: layer.id,
      width: canvas.width,
      height: canvas.height,
      alphaFingerprintHint: fingerprint,
    });
    const mask = Object.freeze({
      width: canvas.width,
      height: canvas.height,
      alpha,
      fingerprint,
    });
    const semanticPolicy = getMotionSemanticPolicy(layer.semanticRole ?? "unknown");
    return [{
      layerId: layer.id,
      mask,
      input: {
        layerId: layer.id,
        manualSplitLayerId: metadata.manualSplitLayerId,
        manualSplitMaskId: metadata.manualSplitMaskId,
        semanticRole: layer.semanticRole ?? "unknown",
        riggingHint: ((layer as { riggingHint?: LayerRiggingHint }).riggingHint ??
          "localBones") as LayerRiggingHint,
        width: canvas.width,
        height: canvas.height,
        alpha,
        sourceLayerId: metadata.manualSplitSourceLayerId,
        sourceTextureId: layer.id,
        sourceFingerprint: metadata.manualSplitSourceFingerprint,
        sourceWidth: sourceCanvas.width,
        sourceHeight: sourceCanvas.height,
        sourceBytes: sourceImageData.data,
        sourceLayerRevision,
        sourceTextureRevision,
        layerPath: [layer.id],
        layerBounds: {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
        },
        protectedRegionSetHash: createProtectedRegionSetHash({
          semanticPolicyId: semanticPolicy.policyId,
          semanticPolicyVersion: semanticPolicy.policyVersion,
          protectedRegionSetRevision,
          regions: protectedRegions,
        }),
        protectedRegionSetRevision,
      },
    }];
  });
  const registry = createAcceptedMaskPacketRegistry(
    packetCandidates.map((candidate) => candidate.input),
  );
  const packetAliases = [...registry.byLayerId.values()].map((packet) => ({
    packet,
    aliases: [
      packet.layerId,
      packet.manualSplitMaskId,
      `mask:${packet.manualSplitMaskId}`,
      packet.manualSplitLayerId,
    ],
  }));
  const aliasPairs = packetAliases.flatMap(({ packet, aliases }) =>
    aliases.map((alias) => ({ alias, layerId: packet.layerId })),
  );
  const conflictedLayerIds = new Set(
    aliasPairs
      .filter((pair, index) =>
        aliasPairs.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            pair.alias === other.alias &&
            pair.layerId !== other.layerId,
        ),
      )
      .map((pair) => pair.layerId),
  );
  const entries = packetAliases.flatMap(({ packet, aliases }) => {
    if (conflictedLayerIds.has(packet.layerId)) return [];
    const baseMask = packetCandidates.find(
      (candidate) => candidate.layerId === packet.layerId,
    )?.mask;
    if (!baseMask) return [];
    const mask = Object.freeze({
      ...baseMask,
      acceptedMaskAlphaHash: packet.acceptedMaskAlphaHash,
      acceptedMaskPlacementHash: packet.acceptedMaskPlacementHash,
      sourceMaskBytesHash: packet.sourceMaskBytesHash,
      protectedRegionSetHash: packet.protectedRegionSetHash,
      protectedRegionSetRevision: packet.protectedRegionSetRevision,
      protectedRegions,
      sourceLayerRevision: packet.sourceLayerRevision,
      sourceTextureRevision: packet.sourceTextureRevision,
    });
    return aliases.map((alias): [string, LocalMotionAcceptedManualMask] => [alias, mask]);
  });
  return Object.fromEntries(entries);
}

function createProtectedCropGeneration(layer: { id: string; x: number; y: number; width: number; height: number; semanticRole?: string }): number {
  const digest = createStableAutoSetupHash({
    kind: "protectedCropGeneration",
    id: layer.id,
    role: layer.semanticRole ?? "unknown",
    bounds: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
  });
  return Number.parseInt(digest.slice(0, 8), 16);
}
