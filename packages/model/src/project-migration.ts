import type { BoneNode, LayerNode, ProjectData } from "./types";

interface LegacyRotationDeformer {
  pivotX: number;
  pivotY: number;
  angle: number;
  scale: number;
  length: number;
}

interface LegacyWarpDeformer {
  bounds: { x: number; y: number; width: number; height: number };
}

interface LegacyLayerNode {
  kind: string;
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blendMode: string;
  expanded: boolean;
  children: LegacyLayerNode[];
  rotationDeformer?: LegacyRotationDeformer;
  warpDeformer?: LegacyWarpDeformer;
  [key: string]: unknown;
}

export function migrateV1toV2(project: ProjectData): ProjectData {
  if (project.scenes && project.scenes.length > 0) return project;
  return {
    ...project,
    scenes: [
      {
        id: crypto.randomUUID(),
        name: "Scene 1",
        clips: project.clips ?? [],
      },
    ],
    clips: [],
  };
}

export function migrateV2toV3(project: ProjectData): ProjectData {
  return {
    ...project,
    layers: migrateLayerTree(project.layers as unknown as LegacyLayerNode[]),
    skins: project.skins ?? {},
  };
}

function migrateLayerTree(layers: LegacyLayerNode[]): LayerNode[] {
  return layers.map((layer) => {
    const children = migrateLayerTree(layer.children ?? []);
    if (layer.kind === "rotationDeformer" && layer.rotationDeformer) {
      const rotation = layer.rotationDeformer;
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        x: rotation.pivotX,
        y: rotation.pivotY,
        width: 0,
        height: 0,
        children,
        blendMode: layer.blendMode as BoneNode["blendMode"],
        expanded: layer.expanded,
        kind: "bone",
        bone: {
          angle: rotation.angle,
          length: rotation.length,
          scaleX: rotation.scale,
          scaleY: rotation.scale,
        },
      } satisfies BoneNode;
    }

    if (layer.kind === "warpDeformer" && layer.warpDeformer) {
      const warp = layer.warpDeformer;
      const centerX = warp.bounds.x + warp.bounds.width / 2;
      const centerY = warp.bounds.y + warp.bounds.height / 2;
      const length = Math.sqrt(warp.bounds.width ** 2 + warp.bounds.height ** 2) / 2;
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        x: centerX,
        y: centerY,
        width: 0,
        height: 0,
        children,
        blendMode: layer.blendMode as BoneNode["blendMode"],
        expanded: layer.expanded,
        kind: "bone",
        bone: { angle: 0, length, scaleX: 1, scaleY: 1 },
      } satisfies BoneNode;
    }

    return { ...layer, children } as unknown as LayerNode;
  });
}

export function migrateV3toV4(project: ProjectData): ProjectData {
  return project;
}

export function migrateV4toV5(project: ProjectData): ProjectData {
  return {
    ...project,
    colliders: project.colliders ?? [],
    stateMachines: project.stateMachines ?? [],
  };
}

export function migrateV5toV6(project: ProjectData): ProjectData {
  return project;
}

export function migrateV6toV7(project: ProjectData): ProjectData {
  return project;
}

export function migrateV7toV8(project: ProjectData): ProjectData {
  return project;
}

export function migrateV8toV9(project: ProjectData): ProjectData {
  return project;
}

export function migrateV9toV10(project: ProjectData): ProjectData {
  return project;
}

export function ensureProjectDefaults(project: ProjectData): ProjectData {
  const next: ProjectData = {
    ...project,
    scenes: project.scenes ?? [],
    skins: project.skins ?? {},
    sceneBlends: project.sceneBlends ?? [],
    ikControllers: project.ikControllers ?? [],
    offscreenTargets: project.offscreenTargets ?? [],
    colliders: project.colliders ?? [],
    stateMachines: project.stateMachines ?? [],
  };
  return next;
}

export const ensureScenes = ensureProjectDefaults;
