import type { AnimationClip, ProjectData } from "@vivi2d/core/types";
import { exportSpineJson } from "@vivi2d/editor-core/spine-export-command";
import { assertNoLocalMotionPreviewFields } from "@vivi2d/model/private-profile-guards";
import { exportTextures } from "./texture-exporter";

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export interface ExportFile {
  path: string;

  content: string | Blob;
}

export interface ExportResult {
  files: ExportFile[];
  warnings: string[];
}

export type ExportFormat = "spine";

export interface ExportOptions {
  layerIds?: ReadonlySet<string>;

  clipIds?: ReadonlySet<string>;
}

export async function exportForSpine(
  project: ProjectData,
  clips: AnimationClip[],
  options?: ExportOptions,
): Promise<ExportResult> {
  assertNoLocalMotionPreviewFields(project, "exportPayload");
  const files: ExportFile[] = [];
  const warnings: string[] = [];
  const modelName = sanitizeFileName(project.name);

  const filteredClips = options?.clipIds
    ? clips.filter((c) => options.clipIds!.has(c.id))
    : clips;

  const textures = await exportTextures(project, options?.layerIds);
  for (const tex of textures) {
    files.push({ path: tex.fileName, content: tex.blob });
  }

  // Spine JSON
  const { json, warnings: spineWarnings } = exportSpineJson(
    project,
    filteredClips,
    options?.layerIds,
  );
  warnings.push(...spineWarnings);
  files.push({
    path: `${modelName}.spine.json`,
    content: JSON.stringify(json, null, 2),
  });

  return { files, warnings };
}
