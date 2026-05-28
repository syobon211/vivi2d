// Public-profile validation is the model boundary used by SDKs and runtime
// playback paths. It accepts only playback-safe project data and rejects
// editor-only previews, provider raw output, and authoring-only temporary state.
import { validateNoLocalMotionPreviewFields } from "./private-profile-guards";
import {
  VIVI_RUNTIME_ALLOWED_BINDING_TARGET_TYPES,
  VIVI_RUNTIME_ALLOWED_EXPRESSION_PRESET_KEYS,
  VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE,
  VIVI_RUNTIME_FORBIDDEN_RAW_KEYS,
} from "./runtime-spec";
import type { ProjectData, ViviFileData } from "./types";

export const PUBLIC_PROJECT_PROFILE = "publicProfileV1" as const;

export type PublicProjectProfile = typeof PUBLIC_PROJECT_PROFILE;

export interface PublicProfileIssue {
  code: string;
  path: string;
  message: string;
}

export class PublicProfileError extends Error {
  readonly issues: PublicProfileIssue[];

  constructor(issues: PublicProfileIssue[]) {
    super(formatPublicProfileIssues(issues));
    this.name = "PublicProfileError";
    this.issues = issues;
  }
}

export function formatPublicProfileIssues(issues: readonly PublicProfileIssue[]): string {
  if (issues.length === 0) return "public profile validation failed";
  const first = issues[0]!;
  return `public profile validation failed: ${first.path}: ${first.message}`;
}

export function validatePublicViviFileProfile(
  fileData: ViviFileData,
): PublicProfileIssue[] {
  const issues: PublicProfileIssue[] = [];
  issues.push(...validatePublicRawViviFileProfile(fileData));
  if (fileData.profile !== undefined && fileData.profile !== PUBLIC_PROJECT_PROFILE) {
    issues.push({
      code: "unsupportedProfile",
      path: "profile",
      message: `unsupported public project profile: ${String(fileData.profile)}`,
    });
  }
  issues.push(...validatePublicProjectProfile(fileData.project, "project"));
  return dedupeIssues(issues);
}

export function validatePublicRawViviFileProfile(value: unknown): PublicProfileIssue[] {
  const issues: PublicProfileIssue[] = [];
  if (!isRecord(value)) return issues;
  issues.push(
    ...validateNoLocalMotionPreviewFields(value, "publicProfile").map(
      (issue): PublicProfileIssue => ({
        code: "forbiddenPublicFeature",
        path: issue.path.replace(/^<root>\./, ""),
        message:
          "public project profile cannot contain editor-only local motion preview data",
      }),
    ),
  );
  validateRawPublicKnownFields(value, issues);
  const project = value.project;
  if (isRecord(project)) {
    scanRawPublicObject(project, "project", issues, new WeakSet());
  }
  return dedupeIssues(issues);
}

export function assertPublicRawViviFileProfile(value: unknown): void {
  const issues = validatePublicRawViviFileProfile(value);
  if (issues.length > 0) throw new PublicProfileError(issues);
}

export function assertPublicViviFileProfile(fileData: ViviFileData): void {
  const issues = validatePublicViviFileProfile(fileData);
  if (issues.length > 0) throw new PublicProfileError(issues);
}

export function validatePublicProjectProfile(
  project: ProjectData,
  basePath = "project",
): PublicProfileIssue[] {
  const issues: PublicProfileIssue[] = [];

  validateParameterBindings(project, basePath, issues);
  validateExpressionPresets(project, basePath, issues);

  return issues;
}

export function assertPublicProjectProfile(project: ProjectData): void {
  const issues = validatePublicProjectProfile(project);
  if (issues.length > 0) throw new PublicProfileError(issues);
}

function dedupeIssues(issues: PublicProfileIssue[]): PublicProfileIssue[] {
  const seen = new Set<string>();
  const result: PublicProfileIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}\0${issue.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FORBIDDEN_RAW_KEYS = new Set<string>(VIVI_RUNTIME_FORBIDDEN_RAW_KEYS);

const FORBIDDEN_RAW_KIND_OR_TARGET = new Set<string>(VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE);

const ALLOWED_BINDING_TARGET_TYPES = new Set<string>(
  VIVI_RUNTIME_ALLOWED_BINDING_TARGET_TYPES,
);

const ALLOWED_EXPRESSION_PRESET_KEYS = new Set<string>(
  VIVI_RUNTIME_ALLOWED_EXPRESSION_PRESET_KEYS,
);

const PUBLIC_FILE_KEYS = new Set(["version", "profile", "project", "atlases"]);

const PUBLIC_PROJECT_KEYS = new Set([
  "name",
  "width",
  "height",
  "sourceKind",
  "layers",
  "parameters",
  "clips",
  "scenes",
  "physicsGroups",
  "lipsyncConfig",
  "skins",
  "parameterBindings",
  "sceneBlends",
  "ikControllers",
  "offscreenTargets",
  "expressionPresets",
  "colliders",
  "stateMachines",
]);

function pushForbiddenRawIssue(issues: PublicProfileIssue[], path: string): void {
  issues.push({
    code: "forbiddenPublicFeature",
    path,
    message:
      "public project profile only accepts layer, bone, IK, skin, physics, and parameter data",
  });
}

function pushUnknownRawIssue(issues: PublicProfileIssue[], path: string): void {
  issues.push({
    code: "unknownPublicField",
    path,
    message: "public project profile does not allow unknown fields",
  });
}

function scanRawPublicObject(
  value: unknown,
  path: string,
  issues: PublicProfileIssue[],
  seen: WeakSet<object>,
): void {
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    value.forEach((item, index) => {
      scanRawPublicObject(item, `${path}[${index}]`, issues, seen);
    });
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "string" && isArrayIndexKey(key, value.length)) continue;
      scanRawPublicProperty(value, key, path, issues, seen);
    }
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    scanRawPublicProperty(value, key, path, issues, seen);
  }
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function scanRawPublicProperty(
  value: object,
  key: string | symbol,
  path: string,
  issues: PublicProfileIssue[],
  seen: WeakSet<object>,
): void {
  const keyText = typeof key === "symbol" ? key.toString() : key;
  const childPath = `${path}.${keyText}`;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    (key === "kind" || key === "type") &&
    descriptor !== undefined &&
    !("value" in descriptor)
  ) {
    pushForbiddenRawIssue(issues, path);
    return;
  }
  const child = descriptor && "value" in descriptor ? descriptor.value : undefined;
  if (typeof key === "string" && FORBIDDEN_RAW_KEYS.has(key)) {
    pushForbiddenRawIssue(issues, childPath);
    return;
  }
  if (
    (key === "kind" || key === "type") &&
    typeof child === "string" &&
    FORBIDDEN_RAW_KIND_OR_TARGET.has(child)
  ) {
    pushForbiddenRawIssue(issues, path);
    return;
  }
  scanRawPublicObject(child, childPath, issues, seen);
}

function validateRawKnownKeys(
  value: unknown,
  path: string,
  allowedKeys: ReadonlySet<string>,
  issues: PublicProfileIssue[],
): void {
  if (!isRecord(value)) return;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      pushUnknownRawIssue(issues, `${path}.${String(key)}`);
      continue;
    }
    if (!allowedKeys.has(key)) {
      pushUnknownRawIssue(issues, `${path}.${key}`);
    }
  }
}

function validateRawPublicKnownFields(
  value: unknown,
  issues: PublicProfileIssue[],
): void {
  validateRawKnownKeys(value, "<root>", PUBLIC_FILE_KEYS, issues);
  if (!isRecord(value)) return;
  validateRawKnownKeys(value.project, "project", PUBLIC_PROJECT_KEYS, issues);
}

function validateParameterBindings(
  project: ProjectData,
  basePath: string,
  issues: PublicProfileIssue[],
): void {
  for (let index = 0; index < (project.parameterBindings ?? []).length; index += 1) {
    const binding = project.parameterBindings![index]!;
    if (!ALLOWED_BINDING_TARGET_TYPES.has(binding.target.type)) {
      issues.push({
        code: "forbiddenPublicFeature",
        path: `${basePath}.parameterBindings[${index}].target`,
        message: "parameter bindings may target bones or IK controllers only",
      });
    }
  }
}

function validateExpressionPresets(
  project: ProjectData,
  basePath: string,
  issues: PublicProfileIssue[],
): void {
  for (let index = 0; index < (project.expressionPresets ?? []).length; index += 1) {
    const preset = project.expressionPresets![index] as unknown as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(preset)) {
      if (!ALLOWED_EXPRESSION_PRESET_KEYS.has(key)) {
        issues.push({
          code: "forbiddenPublicFeature",
          path: `${basePath}.expressionPresets[${index}].${key}`,
          message: "expression presets may contain parameter values only",
        });
      }
    }
  }
}
