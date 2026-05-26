import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  migrateV1toV2,
  migrateV2toV3,
  migrateV3toV4,
  migrateV4toV5,
} from "@vivi2d/core/project-migration";
import { parseViviFile as parseViviFileCore } from "@vivi2d/core/project-parser";
import {
  assertPublicViviFileProfile,
  PUBLIC_PROJECT_PROFILE,
  type PublicProjectProfile,
} from "@vivi2d/core/public-profile";
import type { AtlasEntry, ProjectData, ViviFileData } from "@vivi2d/core/types";
import { assertNoLocalMotionPreviewFields } from "@vivi2d/model/private-profile-guards";
import { buildAtlases, remapUvs, unremapUvs } from "./atlas-packer";
import { clearTextures, setTexture } from "./texture-store";

export function serializeProject(
  project: ProjectData,
  textures: ReadonlyMap<string, HTMLCanvasElement>,
  options: { profile?: PublicProjectProfile | "internal" } = {
    profile: PUBLIC_PROJECT_PROFILE,
  },
): ViviFileData {
  assertNoLocalMotionPreviewFields(project, "projectSave");
  const atlases = buildAtlases(textures);

  const entryMap = new Map<
    string,
    { entry: AtlasEntry; atlasWidth: number; atlasHeight: number }
  >();
  for (const atlas of atlases) {
    for (const entry of atlas.entries) {
      entryMap.set(entry.layerId, {
        entry,
        atlasWidth: atlas.width,
        atlasHeight: atlas.height,
      });
    }
  }

  const clonedProject = deepCloneProject(project);
  const allNodes = flattenLayers(clonedProject.layers);
  for (const node of allNodes) {
    if (node.kind !== "viviMesh") continue;
    const mapping = entryMap.get(node.id);
    if (!mapping) continue;
    node.mesh.uvs = remapUvs(
      node.mesh.uvs,
      mapping.entry,
      mapping.atlasWidth,
      mapping.atlasHeight,
    );
  }

  const fileData: ViviFileData = {
    version: 9,
    profile: options.profile === PUBLIC_PROJECT_PROFILE ? PUBLIC_PROJECT_PROFILE : undefined,
    project: clonedProject,
    atlases,
  };
  if (options.profile === PUBLIC_PROJECT_PROFILE) {
    assertPublicViviFileProfile(fileData);
  }
  return fileData;
}

export function parseViviFile(json: string): ViviFileData {
  return parseViviFileCore(json, { profile: PUBLIC_PROJECT_PROFILE });
}

export async function deserializeProject(fileData: ViviFileData): Promise<ProjectData> {
  clearTextures();

  const { project, atlases } = fileData;

  const entryMap = new Map<
    string,
    { entry: AtlasEntry; atlasWidth: number; atlasHeight: number }
  >();

  for (const atlas of atlases) {
    const atlasCanvas = await loadImageAsCanvas(atlas.image, atlas.width, atlas.height);

    for (const entry of atlas.entries) {
      entryMap.set(entry.layerId, {
        entry,
        atlasWidth: atlas.width,
        atlasHeight: atlas.height,
      });

      const texCanvas = document.createElement("canvas");
      texCanvas.width = entry.width;
      texCanvas.height = entry.height;
      const ctx = texCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          atlasCanvas,
          entry.x,
          entry.y,
          entry.width,
          entry.height,
          0,
          0,
          entry.width,
          entry.height,
        );
      }
      setTexture(entry.layerId, texCanvas);
    }
  }

  const migratedV2 = migrateV1toV2(project);
  Object.assign(project, migratedV2);

  const migratedV3 = migrateV2toV3(project);
  Object.assign(project, migratedV3);

  const migratedV4 = migrateV3toV4(project);
  Object.assign(project, migratedV4);

  const migratedV5 = migrateV4toV5(project);
  Object.assign(project, migratedV5);

  const allNodes = flattenLayers(project.layers);
  for (const node of allNodes) {
    if (node.kind !== "viviMesh") continue;
    const mapping = entryMap.get(node.id);
    if (!mapping) continue;
    node.mesh.uvs = unremapUvs(
      node.mesh.uvs,
      mapping.entry,
      mapping.atlasWidth,
      mapping.atlasHeight,
    );
  }

  return project;
}

function loadImageAsCanvas(
  base64: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to load atlas image"));
    img.src = `data:image/png;base64,${base64}`;
  });
}

function deepCloneProject(project: ProjectData): ProjectData {
  return structuredClone(project);
}
