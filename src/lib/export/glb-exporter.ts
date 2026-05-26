import { flattenLayers } from "@vivi2d/core/layer-utils";
import { meshDataToTypedArrays } from "@vivi2d/core/mesh-utils";
import type { ProjectData } from "@vivi2d/core/types";
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getAllTextures } from "@/lib/texture-store";

export interface GlbExportOptions {
  maxTextureSize?: number;

  binary?: boolean;
}

export async function exportGlb(
  project: ProjectData,
  options?: GlbExportOptions,
): Promise<ArrayBuffer> {
  const scene = new Scene();
  scene.name = project.name;

  const textures = getAllTextures();
  const allLayers = flattenLayers(project.layers);

  let zOffset = 0;
  for (const layer of allLayers) {
    if (layer.kind !== "viviMesh") continue;

    const canvas = textures.get(layer.id);
    if (!canvas) continue;

    const meshObj = buildMeshObject(layer, canvas, zOffset);
    if (meshObj) {
      scene.add(meshObj);
      zOffset -= 0.01;
    }
  }

  const rootBone = buildBoneHierarchy(project);
  if (rootBone) {
    scene.add(rootBone);
  }

  const exporter = new GLTFExporter();
  const binary = options?.binary ?? true;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          const json = JSON.stringify(result);
          const encoder = new TextEncoder();
          resolve(encoder.encode(json).buffer as ArrayBuffer);
        }
      },
      (error) => reject(new Error(`GLB export failed: ${error}`)),
      { binary },
    );
  });
}

function buildMeshObject(
  layer: import("@vivi2d/core/types").ViviMeshNode,
  canvas: HTMLCanvasElement,
  zOffset: number,
): Mesh | null {
  const { vertices, uvs, indices } = meshDataToTypedArrays(layer.mesh);

  const vertCount = vertices.length / 2;
  const position = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    position[i * 3] = (layer.x + vertices[i * 2]!) / 100;
    position[i * 3 + 1] = -(layer.y + vertices[i * 2 + 1]!) / 100; // Blender Y-up
    position[i * 3 + 2] = zOffset;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));

  const texture = new CanvasTexture(canvas);
  texture.flipY = false;

  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    side: 2, // DoubleSide
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = layer.name;

  return mesh;
}

function buildBoneHierarchy(project: ProjectData): Object3D | null {
  const allLayers = flattenLayers(project.layers);
  const boneNodes = allLayers.filter((l) => l.kind === "bone");
  if (boneNodes.length === 0) return null;

  const root = new Object3D();
  root.name = "Armature";

  const boneMap = new Map<string, Bone>();

  for (const node of boneNodes) {
    if (node.kind !== "bone") continue;
    const bone = new Bone();
    bone.name = node.name;
    bone.position.set(node.x / 100, -node.y / 100, 0);
    boneMap.set(node.id, bone);
  }

  for (const node of boneNodes) {
    if (node.kind !== "bone") continue;
    const bone = boneMap.get(node.id);
    if (!bone) continue;

    const parentId = node.parentBoneId;
    if (parentId) {
      const parent = boneMap.get(parentId);
      if (parent) {
        parent.add(bone);
        continue;
      }
    }
    root.add(bone);
  }

  return root;
}
