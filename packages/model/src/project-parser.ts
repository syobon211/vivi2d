import type { ZodIssue } from "zod";
import { assertTextLengthWithinLimit, MAX_VIVI_TEXT_FILE_BYTES } from "./load-limits";
import { ViviFileDataSchema } from "./project-schema";
import {
  assertPublicRawViviFileProfile,
  assertPublicViviFileProfile,
  type PublicProjectProfile,
} from "./public-profile";
import type { ViviFileData } from "./types";

const VALID_LAYER_KINDS: ReadonlySet<string> = new Set([
  "viviMesh",
  "group",
  "bone",
  "artPath",
]);

function validateLayers(layers: unknown[], path: string): void {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerPath = `${path}[${i}]`;
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      throw new Error(`Failed to parse .vivi file: ${layerPath} is not an object`);
    }
    const obj = layer as Record<string, unknown>;
    if (typeof obj.kind !== "string" || !VALID_LAYER_KINDS.has(obj.kind)) {
      throw new Error(
        `Failed to parse .vivi file: ${layerPath}.kind is invalid (${String(obj.kind)})`,
      );
    }
    if (typeof obj.id !== "string" || obj.id.length === 0) {
      throw new Error(`Failed to parse .vivi file: ${layerPath}.id is invalid`);
    }
    if (obj.children !== undefined) {
      if (!Array.isArray(obj.children)) {
        throw new Error(
          `Failed to parse .vivi file: ${layerPath}.children is not an array`,
        );
      }
      validateLayers(obj.children, `${layerPath}.children`);
    }
  }
}

function validateAtlasEntries(entries: unknown[], basePath: string): void {
  for (let j = 0; j < entries.length; j++) {
    const entry = entries[j];
    const entryPath = `${basePath}[${j}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Failed to parse .vivi file: ${entryPath} is not an object`);
    }
    const eo = entry as Record<string, unknown>;
    if (typeof eo.layerId !== "string" || eo.layerId.length === 0) {
      throw new Error(`Failed to parse .vivi file: ${entryPath}.layerId is invalid`);
    }
    for (const key of ["x", "y", "width", "height"] as const) {
      if (typeof eo[key] !== "number" || !Number.isFinite(eo[key])) {
        throw new Error(
          `Failed to parse .vivi file: ${entryPath}.${key} is not a finite number`,
        );
      }
    }
    if ((eo.width as number) < 0 || (eo.height as number) < 0) {
      throw new Error(
        `Failed to parse .vivi file: ${entryPath}.width/height is negative`,
      );
    }
  }
}

function validateAtlases(atlases: unknown[]): void {
  for (let i = 0; i < atlases.length; i++) {
    const atlas = atlases[i];
    const atlasPath = `atlases[${i}]`;
    if (!atlas || typeof atlas !== "object" || Array.isArray(atlas)) {
      throw new Error(`Failed to parse .vivi file: ${atlasPath} is not an object`);
    }
    const obj = atlas as Record<string, unknown>;
    if (typeof obj.image !== "string") {
      throw new Error(`Failed to parse .vivi file: ${atlasPath}.image is not a string`);
    }
    if (
      typeof obj.width !== "number" ||
      typeof obj.height !== "number" ||
      !Number.isFinite(obj.width) ||
      !Number.isFinite(obj.height) ||
      (obj.width as number) <= 0 ||
      (obj.height as number) <= 0
    ) {
      throw new Error(
        `Failed to parse .vivi file: ${atlasPath}.width/height is not a valid positive number`,
      );
    }
    if (!Array.isArray(obj.entries)) {
      throw new Error(`Failed to parse .vivi file: ${atlasPath}.entries is not an array`);
    }
    validateAtlasEntries(obj.entries, `${atlasPath}.entries`);
  }
}

function formatIssuePath(issue: ZodIssue): string {
  if (issue.path.length === 0) return "<root>";
  let out = "";
  for (const seg of issue.path) {
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else {
      out += out === "" ? String(seg) : `.${String(seg)}`;
    }
  }
  return out;
}

function formatIssueMessage(issue: ZodIssue): string {
  const path = formatIssuePath(issue);
  return `${path}: ${issue.message}`;
}

export interface ParseViviFileOptions {
  profile?: PublicProjectProfile | "internal";
}

export function parseViviFile(
  json: string,
  options: ParseViviFileOptions = {},
): ViviFileData {
  assertTextLengthWithinLimit(json, MAX_VIVI_TEXT_FILE_BYTES, ".vivi file");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Failed to parse .vivi file: invalid JSON");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Failed to parse .vivi file: root value is not an object");
  }

  const obj = data as Record<string, unknown>;

  if (
    obj.version !== 1 &&
    obj.version !== 2 &&
    obj.version !== 3 &&
    obj.version !== 4 &&
    obj.version !== 5 &&
    obj.version !== 6 &&
    obj.version !== 7 &&
    obj.version !== 8 &&
    obj.version !== 9 &&
    obj.version !== 10
  ) {
    throw new Error(`Invalid .vivi file version: ${obj.version}`);
  }
  if (!obj.project || typeof obj.project !== "object") {
    throw new Error(".vivi file is missing the project field");
  }
  if (!Array.isArray(obj.atlases)) {
    throw new Error(".vivi file is missing the atlases field");
  }

  const proj = obj.project as Record<string, unknown>;
  if (!Array.isArray(proj.layers)) {
    throw new Error(".vivi file is missing the layers field");
  }
  if (!Array.isArray(proj.parameters)) {
    throw new Error(".vivi file is missing the parameters field");
  }
  if (proj.name !== undefined && typeof proj.name !== "string") {
    throw new Error(".vivi file project.name is not a string");
  }
  for (const key of ["width", "height"] as const) {
    const v = proj[key];
    if (v !== undefined) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
        throw new Error(`.vivi file project.${key} is not a valid positive number`);
      }
    }
  }

  validateLayers(proj.layers, "project.layers");
  validateAtlases(obj.atlases);
  if (options.profile === "publicProfileV1" || obj.profile === "publicProfileV1") {
    assertPublicRawViviFileProfile(data);
  }

  const zodResult = ViviFileDataSchema.safeParse(data);
  if (!zodResult.success) {
    const issue = zodResult.error.issues[0];
    if (issue) {
      throw new Error(`Failed to parse .vivi file: ${formatIssueMessage(issue)}`);
    }
    throw new Error("Failed to parse .vivi file: schema validation error");
  }

  const fileData = zodResult.data as ViviFileData;
  if (options.profile === "publicProfileV1") {
    assertPublicViviFileProfile(fileData);
  }
  return fileData;
}
