import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  ensureProjectDefaults,
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
import { assertAtlasImageAllocationWithinLimits } from "@vivi2d/model/load-limits";
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
    profile:
      options.profile === PUBLIC_PROJECT_PROFILE ? PUBLIC_PROJECT_PROFILE : undefined,
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
  const prepared = await prepareDeserializedProject(fileData);
  clearTextures();
  for (const [layerId, canvas] of prepared.textures) setTexture(layerId, canvas);
  return prepared.project;
}

/** Preparation-only route for atomic adoption across an active v11 session. */
export async function prepareDeserializedProject(
  fileData: ViviFileData,
): Promise<{ project: ProjectData; textures: ReadonlyMap<string, HTMLCanvasElement> }> {
  const { project, atlases } = fileData;
  assertAtlasImageAllocationWithinLimits(atlases);
  // Keep the active project's textures intact until every atlas is decoded and
  // project migration succeeds. A rejected import must not damage the open file.
  const nextTextures = new Map<string, HTMLCanvasElement>();

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
      nextTextures.set(entry.layerId, texCanvas);
    }
  }

  // Use the validated input version for each historical step. Newer empty
  // collections are authored state, not evidence of an old-format document.
  if (fileData.version < 2) Object.assign(project, migrateV1toV2(project));
  if (fileData.version < 3) Object.assign(project, migrateV2toV3(project));
  if (fileData.version < 4) Object.assign(project, migrateV3toV4(project));
  if (fileData.version < 5) Object.assign(project, migrateV4toV5(project));
  Object.assign(project, ensureProjectDefaults(project));

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

  return { project, textures: nextTextures };
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
