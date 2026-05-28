import {
  MODEL_FORBIDDEN_KIND_OR_TYPE,
  MODEL_FORBIDDEN_RAW_KEYS,
  MODEL_HIGH_SIGNAL_STRING_MARKERS,
} from "./generated/private-local-motion-markers";

export type LocalMotionPreviewGuardContext =
  | "projectSave"
  | "publicProfile"
  | "runtimePayload"
  | "providerArtifact"
  | "exportPayload"
  | "fixture"
  | "undoSnapshot"
  | "workflowArtifact";

export interface LocalMotionPreviewGuardIssue {
  code: "forbiddenLocalMotionPreviewField";
  context: LocalMotionPreviewGuardContext;
  path: string;
  marker: string;
  message: string;
}

export class LocalMotionPreviewGuardError extends Error {
  readonly issues: LocalMotionPreviewGuardIssue[];

  constructor(issues: LocalMotionPreviewGuardIssue[]) {
    super(formatLocalMotionPreviewGuardIssues(issues));
    this.name = "LocalMotionPreviewGuardError";
    this.issues = issues;
  }
}

const FORBIDDEN_RAW_KEYS = new Set<string>(MODEL_FORBIDDEN_RAW_KEYS);

const FORBIDDEN_KIND_OR_TYPE = new Set<string>(MODEL_FORBIDDEN_KIND_OR_TYPE);

const NORMALIZED_HIGH_SIGNAL_STRING_MARKERS = MODEL_HIGH_SIGNAL_STRING_MARKERS.map(
  (marker) => [marker, normalizeMarkerText(marker)] as const,
);

export function formatLocalMotionPreviewGuardIssues(
  issues: readonly LocalMotionPreviewGuardIssue[],
): string {
  if (issues.length === 0) return "local motion preview guard failed";
  const first = issues[0]!;
  return `local motion preview guard failed: ${first.path}: ${first.message}`;
}

export function assertNoLocalMotionPreviewFields(
  value: unknown,
  context: LocalMotionPreviewGuardContext,
): void {
  const issues = validateNoLocalMotionPreviewFields(value, context);
  if (issues.length > 0) throw new LocalMotionPreviewGuardError(issues);
}

export function validateNoLocalMotionPreviewFields(
  value: unknown,
  context: LocalMotionPreviewGuardContext,
): LocalMotionPreviewGuardIssue[] {
  const issues: LocalMotionPreviewGuardIssue[] = [];
  scanNoLocalMotionPreviewFields(value, context, "<root>", issues, new WeakSet());
  return dedupeIssues(issues);
}

function scanNoLocalMotionPreviewFields(
  value: unknown,
  context: LocalMotionPreviewGuardContext,
  path: string,
  issues: LocalMotionPreviewGuardIssue[],
  seen: WeakSet<object>,
): void {
  if (typeof value === "string") {
    pushStringMarkerIssues(value, context, path, issues);
    return;
  }
  if (value instanceof Map) {
    if (seen.has(value)) return;
    seen.add(value);
    let index = 0;
    for (const [entryKey, entryValue] of value.entries()) {
      scanNoLocalMotionPreviewFields(entryKey, context, `${path}<key:${index}>`, issues, seen);
      scanNoLocalMotionPreviewFields(entryValue, context, `${path}<value:${index}>`, issues, seen);
      index += 1;
    }
    return;
  }
  if (value instanceof Set) {
    if (seen.has(value)) return;
    seen.add(value);
    let index = 0;
    for (const entry of value.values()) {
      scanNoLocalMotionPreviewFields(entry, context, `${path}<entry:${index}>`, issues, seen);
      index += 1;
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    value.forEach((item, index) => {
      scanNoLocalMotionPreviewFields(item, context, `${path}[${index}]`, issues, seen);
    });
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "string" && isArrayIndexKey(key, value.length)) continue;
      scanProperty(value, key, context, path, issues, seen);
    }
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    scanProperty(value, key, context, path, issues, seen);
  }
}

function scanProperty(
  value: object,
  key: string | symbol,
  context: LocalMotionPreviewGuardContext,
  path: string,
  issues: LocalMotionPreviewGuardIssue[],
  seen: WeakSet<object>,
): void {
  const keyText = typeof key === "symbol" ? key.toString() : key;
  const childPath = `${path}.${keyText}`;

  pushStringMarkerIssues(keyText, context, childPath, issues);

  if (typeof key === "string" && FORBIDDEN_RAW_KEYS.has(key)) {
    pushIssue(issues, context, childPath, key);
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return;
  if (!("value" in descriptor)) {
    if (key === "kind" || key === "type") {
      pushIssue(issues, context, childPath, keyText);
    }
    return;
  }

  const child = descriptor.value;
  if (
    (key === "kind" || key === "type") &&
    typeof child === "string" &&
    FORBIDDEN_KIND_OR_TYPE.has(child)
  ) {
    pushIssue(issues, context, childPath, child);
    return;
  }

  scanNoLocalMotionPreviewFields(child, context, childPath, issues, seen);
}

function pushStringMarkerIssues(
  value: string,
  context: LocalMotionPreviewGuardContext,
  path: string,
  issues: LocalMotionPreviewGuardIssue[],
): void {
  const normalized = normalizeMarkerText(value);
  for (const [marker, normalizedMarker] of NORMALIZED_HIGH_SIGNAL_STRING_MARKERS) {
    if (normalized.includes(normalizedMarker)) {
      pushIssue(issues, context, path, marker);
    }
  }
}

function pushIssue(
  issues: LocalMotionPreviewGuardIssue[],
  context: LocalMotionPreviewGuardContext,
  path: string,
  marker: string,
): void {
  issues.push({
    code: "forbiddenLocalMotionPreviewField",
    context,
    path,
    marker,
    message: `${context} cannot contain editor-only local motion preview marker ${marker}`,
  });
}

function dedupeIssues(
  issues: LocalMotionPreviewGuardIssue[],
): LocalMotionPreviewGuardIssue[] {
  const seen = new Set<string>();
  const result: LocalMotionPreviewGuardIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.context}\0${issue.path}\0${issue.marker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

function normalizeMarkerText(value: string): string {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
