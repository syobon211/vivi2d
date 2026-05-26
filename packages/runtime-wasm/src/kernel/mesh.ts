import type {
  LayerNode,
  MeshRenderState,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core";
import type { RuntimeAffine2D } from "./bone";
import {
  getRuntimeDrawOrder,
  getRuntimeMultiplyColor,
  isRuntimeScreenColorDefault,
} from "./colors";
import { isRuntimePolygonFlipped } from "./culling";
import { isRuntimeLayerEffectivelyVisible } from "./layers";
import { meshDataToRuntimeTypedArrays } from "./mesh-data";
import { computeRuntimeSkinnedVertices } from "./skinning";

export interface RuntimeMeshComputeContext {
  readonly project: ProjectData;
  readonly allLayers: readonly LayerNode[];
  readonly meshStaticCache: Map<string, { uvs: Float32Array; indices: Uint32Array }>;
  readonly meshScratchVerts: Map<string, Float32Array>;
  readonly meshStates: Map<string, MeshRenderState>;
  readonly drawOrderScratch: { id: string; zIndex: number }[];
  readonly drawOrderCache: string[];
  readonly worldTransforms: Map<string, RuntimeAffine2D>;
}

export function computeRuntimeMeshStates(ctx: RuntimeMeshComputeContext): void {
  const drawOrder = ctx.drawOrderScratch;
  drawOrder.length = 0;
  const processedIds = new Set<string>();

  for (const layer of ctx.allLayers) {
    if (layer.kind !== "viviMesh") continue;

    let scratch = ctx.meshScratchVerts.get(layer.id);
    if (!scratch || scratch.length !== layer.mesh.vertices.length) {
      scratch = new Float32Array(layer.mesh.vertices.length);
      ctx.meshScratchVerts.set(layer.id, scratch);
    }
    computeFinalVerticesInto(ctx, layer, scratch);

    let staticData = ctx.meshStaticCache.get(layer.id);
    if (!staticData) {
      const typed = meshDataToRuntimeTypedArrays(layer.mesh);
      staticData = { uvs: typed.uvs, indices: typed.indices };
      ctx.meshStaticCache.set(layer.id, staticData);
    }

    const zIndex = getRuntimeDrawOrder(layer.drawOrder);
    const visible = isRuntimeLayerEffectivelyVisible(layer, ctx.project.layers);
    const culled =
      layer.culling === true && visible && isRuntimePolygonFlipped(scratch);
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
        multiplyColor: getRuntimeMultiplyColor(layer.multiplyColor),
        screenColor: isRuntimeScreenColorDefault(layer.screenColor)
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
      state.multiplyColor = getRuntimeMultiplyColor(layer.multiplyColor);
      state.screenColor = isRuntimeScreenColorDefault(layer.screenColor)
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
  for (let index = 0; index < drawOrder.length; index += 1) {
    ctx.drawOrderCache[index] = drawOrder[index]!.id;
  }
}

function compareDrawOrderAsc(
  a: { id: string; zIndex: number },
  b: { id: string; zIndex: number },
): number {
  return a.zIndex - b.zIndex;
}

function computeFinalVerticesInto(
  ctx: RuntimeMeshComputeContext,
  layer: ViviMeshNode,
  out: Float32Array,
): void {
  const skin = ctx.project.skins[layer.id];
  const vertices = skin
    ? computeRuntimeSkinnedVertices(
        layer.mesh.vertices,
        skin,
        ctx.worldTransforms,
      )
    : layer.mesh.vertices;
  const length = Math.min(out.length, vertices.length);
  for (let index = 0; index < length; index += 1) {
    out[index] = vertices[index]!;
  }
}
