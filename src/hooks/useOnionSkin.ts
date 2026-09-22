import { buildBoneMap, computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { meshDataToTypedArrays } from "@vivi2d/core/mesh-utils";
import { findClipInProject } from "@vivi2d/core/scene-utils";
import { computeSkinnedVertices } from "@vivi2d/core/skin-utils";
import {
  evaluateBoneTracksAtFrame,
  evaluateClipAtFrame,
} from "@vivi2d/core/timeline-utils";
import type {
  AnimationClip,
  LayerNode,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import {
  createGhostMesh,
  createOverlayContainer,
  destroyOverlayContainer,
  type EditorOverlayContainer,
} from "@vivi2d/renderer-pixi/editor-overlays";
import { useEffect, useRef } from "react";
import { getTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useViewportStore } from "@/stores/viewportStore";
import type { PixiAppRefs } from "./usePixiApp";

const GHOST_COLOR_BEFORE = 0x5599ff;
const GHOST_COLOR_AFTER = 0xff7744;

const GHOST_ZINDEX = -100;

export function useOnionSkin(pixiRefs: React.RefObject<PixiAppRefs>) {
  const ghostContainer = useRef<EditorOverlayContainer | null>(null);
  const app = pixiRefs.current.app;

  const project = useEditorStore((s) => s.project);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const activeClipId = useTimelineStore((s) => s.activeClipId);
  const onionSkin = useViewportStore((s) => s.onionSkin);

  useEffect(() => {
    const world = pixiRefs.current.world;
    if (!world || pixiRefs.current.app !== app) return;
    const invalidate = pixiRefs.current.requestDisplayRender;

    if (ghostContainer.current) {
      destroyOverlayContainer(ghostContainer.current);
      ghostContainer.current = null;
      invalidate?.();
    }

    if (!onionSkin.enabled || !project || !activeClipId) return;

    const clip = findClipInProject(project, activeClipId);
    if (!clip) return;

    invalidate?.();
    const container = createOverlayContainer(world, "onion-skin", GHOST_ZINDEX);
    ghostContainer.current = container;

    const allLayers = flattenLayers(project.layers);
    const viviMeshes = allLayers.filter(isViviMesh);
    if (viviMeshes.length === 0) return;

    for (let i = 1; i <= onionSkin.framesBefore; i++) {
      const frame = currentFrame - i;
      if (frame < 0) break;
      const alpha = onionSkin.opacity * (1 - (i - 1) / onionSkin.framesBefore);
      renderGhostFrame(
        container,
        project,
        clip,
        viviMeshes,
        frame,
        alpha,
        GHOST_COLOR_BEFORE,
      );
    }

    for (let i = 1; i <= onionSkin.framesAfter; i++) {
      const frame = currentFrame + i;
      if (frame > clip.duration) break;
      const alpha = onionSkin.opacity * (1 - (i - 1) / onionSkin.framesAfter);
      renderGhostFrame(
        container,
        project,
        clip,
        viviMeshes,
        frame,
        alpha,
        GHOST_COLOR_AFTER,
      );
    }

    return () => {
      if (ghostContainer.current) {
        destroyOverlayContainer(ghostContainer.current);
        ghostContainer.current = null;
        invalidate?.();
      }
    };
  }, [
    onionSkin.enabled,
    onionSkin.framesBefore,
    onionSkin.framesAfter,
    onionSkin.opacity,
    project,
    currentFrame,
    activeClipId,
    pixiRefs,
    app,
  ]);
}

function renderGhostFrame(
  container: EditorOverlayContainer,
  project: ProjectData,
  clip: AnimationClip,
  viviMeshes: ViviMeshNode[],
  frame: number,
  alpha: number,
  tint: number,
): void {
  evaluateClipAtFrame(clip, frame);

  const boneOverrides = clip.boneTracks
    ? evaluateBoneTracksAtFrame(clip.boneTracks, frame)
    : {};

  const worldTransforms = computeBoneWorldTransformsWithOverrides(
    project.layers as LayerNode[],
    boneOverrides,
  );

  for (const layer of viviMeshes) {
    if (!layer.visible) continue;
    const canvas = getTexture(layer.id);
    if (!canvas) continue;

    try {
      const typed = meshDataToTypedArrays(layer.mesh);

      const mesh = createGhostMesh({
        textureSource: canvas,
        vertices: new Float32Array(typed.vertices),
        uvs: typed.uvs,
        indices: typed.indices,
        x: layer.x,
        y: layer.y,
        alpha,
        tint,
      });

      const skin = project.skins[layer.id];
      if (skin) {
        const verts = computeSkinnedVertices(layer.mesh.vertices, skin, worldTransforms);
        mesh.vertices = new Float32Array(verts);
      }

      container.addChild(mesh);
    } catch {}
  }
}

function computeBoneWorldTransformsWithOverrides(
  layers: LayerNode[],
  boneOverrides: Record<string, { angle?: number; scaleX?: number; scaleY?: number }>,
): ReturnType<typeof computeBoneWorldTransforms> {
  if (Object.keys(boneOverrides).length === 0) {
    return computeBoneWorldTransforms(layers);
  }

  // Authoring state may be frozen. Only temporary bone snapshots receive the
  // preview pose; the existing utility resolves parents through parentBoneId.
  const bones = [...buildBoneMap(layers).values()].map((node) => {
    const override = boneOverrides[node.id] ?? {};
    return {
      ...node,
      children: [],
      bone: {
        ...node.bone,
        angle: override.angle !== undefined ? override.angle : node.bone.angle,
        scaleX: override.scaleX !== undefined ? override.scaleX : node.bone.scaleX,
        scaleY: override.scaleY !== undefined ? override.scaleY : node.bone.scaleY,
      },
    };
  });
  return computeBoneWorldTransforms(bones);
}
