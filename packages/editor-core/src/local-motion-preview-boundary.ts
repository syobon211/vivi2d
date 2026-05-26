const editorPreviewBrand = Symbol("vivi2d.editorPreview");
const privatePreviewMarker = (...parts: string[]) => parts.join("");

export const PREVIEW_ONLY_STATUS = privatePreviewMarker(
  "preview",
  "Only",
) as "previewOnly";

const EDITOR_PREVIEW_FRAME_KIND = privatePreviewMarker(
  "editor",
  "Preview",
  "Frame",
);

function normalizePreviewFieldMarker(value: string): string {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

const EDITOR_PREVIEW_FIELD_MARKERS = new Set(
  [
    privatePreviewMarker("preview", "Only"),
    privatePreviewMarker("preview", "Solvers"),
    privatePreviewMarker("transient", "Mesh", "Positions"),
    privatePreviewMarker("solver", "Run", "Id"),
  ].map(normalizePreviewFieldMarker),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface EditorOnlyPreview<T> {
  readonly [editorPreviewBrand]: true;
  readonly value: T;
}

export interface LocalPreviewFrame {
  readonly kind: "editorPreviewFrame";
  readonly draftId: string;
  readonly generation: number;
  readonly solverRunId: string;
  readonly transientMeshPositions: Float32Array;
}

export type BrandedLocalPreviewFrame = EditorOnlyPreview<LocalPreviewFrame>;

export function createEditorOnlyPreview<T>(value: T): EditorOnlyPreview<T> {
  return Object.freeze({
    [editorPreviewBrand]: true,
    value,
  });
}

export function assertNoEditorPreviewFields(value: unknown, path = "$"): void {
  if (
    typeof value === "string" &&
    (EDITOR_PREVIEW_FIELD_MARKERS.has(normalizePreviewFieldMarker(value)) ||
      value === EDITOR_PREVIEW_FRAME_KIND)
) {
    throw new Error(`editor-only preview field is not serializable at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoEditorPreviewFields(item, `${path}[${index}]`),
    );
    return;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new Error(`binary editor-only preview data is not serializable at ${path}`);
  }
  if (!isRecord(value)) return;
  if (
    Object.getOwnPropertySymbols(value).some(
      (symbol) => symbol === editorPreviewBrand,
    )
  ) {
    throw new Error(`branded editor-only preview object is not serializable at ${path}`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      EDITOR_PREVIEW_FIELD_MARKERS.has(normalizePreviewFieldMarker(key)) ||
      child === EDITOR_PREVIEW_FRAME_KIND
    ) {
      throw new Error(
        `editor-only preview field is not serializable at ${path}.${key}`,
      );
    }
    assertNoEditorPreviewFields(child, `${path}.${key}`);
  }
}
