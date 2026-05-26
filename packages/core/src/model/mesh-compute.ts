import type { Affine2D } from "../bone-utils";
import { computeBoneWorldTransforms } from "../bone-utils";
import {
  getDrawOrder,
  getMultiplyColor,
  isScreenColorDefault,
} from "../color-utils";
import { isPolygonFlipped } from "../culling-utils";
import { isLayerEffectivelyVisible } from "../layer-utils";
import { meshDataToTypedArrays } from "../mesh-utils";
import { computeSkinnedVertices } from "../skin-utils";
import type {
  ViviMeshNode,
  LayerNode,
  MeshRenderState,
  ProjectData,
} from "../types";

export interface MeshComputeContext {
  project: ProjectData;
  allLayers: LayerNode[];
  parameterValues: Record<string, number>;
  meshStaticCache: Map<string, { uvs: Float32Array; indices: Uint32Array }>;
  meshScratchVerts: Map<string, Float32Array>;
  meshStates: Map<string, MeshRenderState>;
  drawOrderScratch: { id: string; zIndex: number }[];
  drawOrderCache: string[];
}

function compareDrawOrderAsc(
  a: { id: string; zIndex: number },
  b: { id: string; zIndex: number },
): number {
  return a.zIndex - b.zIndex;
}

export function computeAllMeshStates(ctx: MeshComputeContext): void {
  const drawOrder = ctx.drawOrderScratch;
  drawOrder.length = 0;

  const worldTransforms = computeBoneWorldTransforms(ctx.project.layers);

  const processedIds = new Set<string>();

  for (const layer of ctx.allLayers) {
    if (layer.kind !== "viviMesh") continue;

    let scratch = ctx.meshScratchVerts.get(layer.id);
    if (!scratch || scratch.length !== layer.mesh.vertices.length) {
      scratch = new Float32Array(layer.mesh.vertices.length);
      ctx.meshScratchVerts.set(layer.id, scratch);
    }

    computeFinalVerticesInto(ctx, layer, worldTransforms, scratch);

    let staticData = ctx.meshStaticCache.get(layer.id);
    if (!staticData) {
      const typed = meshDataToTypedArrays(layer.mesh);
      staticData = { uvs: typed.uvs, indices: typed.indices };
      ctx.meshStaticCache.set(layer.id, staticData);
    }
    const zIndex = getDrawOrder(layer.drawOrder);
    const visible = isLayerEffectivelyVisible(layer, ctx.project.layers);
    const culled =
      layer.culling === true && visible && isPolygonFlipped(scratch);
    const isSkinned = ctx.project.skins?.[layer.id] !== undefined;
    const verticesSpace = isSkinned ? "model" : "local";

    let state = ctx.meshStates.get(layer.id);
    if (!state) {
      state = {
        id: layer.id,
        vertices: scratch,
        verticesSpace,
        uvs: staticData.uvs,
        indices: staticData.indices,
        x: isSkinned ? 0 : layer.x,
        y: isSkinned ? 0 : layer.y,
        opacity: layer.opacity,
        visible: visible && !culled,
        blendMode: layer.blendMode,
        multiplyColor: getMultiplyColor(layer.multiplyColor),
        screenColor: isScreenColorDefault(layer.screenColor)
          ? undefined
          : layer.screenColor,
        drawOrder: zIndex,
        culled,
      };
      ctx.meshStates.set(layer.id, state);
    } else {
      state.vertices = scratch;
      state.verticesSpace = verticesSpace;
      state.uvs = staticData.uvs;
      state.indices = staticData.indices;
      state.x = isSkinned ? 0 : layer.x;
      state.y = isSkinned ? 0 : layer.y;
      state.opacity = layer.opacity;
      state.visible = visible && !culled;
      state.blendMode = layer.blendMode;
      state.multiplyColor = getMultiplyColor(layer.multiplyColor);
      state.screenColor = isScreenColorDefault(layer.screenColor)
        ? undefined
        : layer.screenColor;
      state.drawOrder = zIndex;
      state.culled = culled;
    }

    processedIds.add(layer.id);
    drawOrder.push({ id: layer.id, zIndex });
  }

  if (ctx.meshStates.size !== processedIds.size) {
    for (const id of ctx.meshStates.keys()) {
      if (!processedIds.has(id)) ctx.meshStates.delete(id);
    }
  }

  drawOrder.sort(compareDrawOrderAsc);
  ctx.drawOrderCache.length = drawOrder.length;
  for (let i = 0; i < drawOrder.length; i++) {
    ctx.drawOrderCache[i] = drawOrder[i]!.id;
  }
}

function computeFinalVerticesInto(
  ctx: MeshComputeContext,
  layer: ViviMeshNode,
  worldTransforms: Map<string, Affine2D>,
  out: Float32Array,
): void {
  const skin = ctx.project.skins[layer.id];
  if (skin) {
    const verts = computeSkinnedVertices(
      layer.mesh.vertices,
      skin,
      worldTransforms,
    );
    const n = Math.min(out.length, verts.length);
    for (let i = 0; i < n; i++) out[i] = verts[i]!;
  } else {
    const src = layer.mesh.vertices;
    const n = Math.min(out.length, src.length);
    for (let i = 0; i < n; i++) out[i] = src[i]!;
  }
}
