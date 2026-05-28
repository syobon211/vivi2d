import type {
  ViewerCommandResult,
  ViewerControllerCommand,
} from "../controller/viewer-controller-ports";
import type { ViviTrackingCalibrationSnapshot } from "../calibration/calibration-store";
import type { ViviProp } from "../props/prop-types";

const PUBLIC_PROP_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let viewerApiPropIdCounter = 0;

export interface ViewerApiRendererRequestPayload {
  requestId: string;
  type: string;
  data: Record<string, unknown>;
  scopes: string[];
}

export interface ViewerApiRendererResponsePayload {
  ok: boolean;
  data: Record<string, unknown>;
  reason?: string;
}

export interface ViewerApiRendererRequestContext {
  snapshot: () => {
    props: ViviProp[];
    calibration: ViviTrackingCalibrationSnapshot;
  };
  dispatch: (command: ViewerControllerCommand) => Promise<ViewerCommandResult>;
}

export interface ViewerApiPublicProp {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  drawOrder: number;
  opacity: number;
  transform: ViviProp["transform"];
  groupId: string | null;
  anchor: { kind: string } | null;
  source: {
    kind: string;
    mimeType: string;
    portable: boolean;
    bytes: number;
  };
}

export interface ViewerApiCalibrationDiagnosticSummary {
  channelId: string;
  source: string;
  value: number;
  calibrated: boolean;
  clipped: boolean;
  stale: boolean;
  observedMin?: number;
  observedMax?: number;
}

export function isViewerApiRendererRequestPayload(
  value: unknown,
): value is ViewerApiRendererRequestPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.requestId === "string" &&
    typeof value.type === "string" &&
    isRecord(value.data) &&
    Array.isArray(value.scopes) &&
    value.scopes.every((scope) => typeof scope === "string")
  );
}

export async function resolveViewerApiRendererRequest(
  payload: ViewerApiRendererRequestPayload,
  context: ViewerApiRendererRequestContext,
): Promise<ViewerApiRendererResponsePayload> {
  if (payload.type === "viewer.props.list") {
    return {
      ok: true,
      data: {
        props: context.snapshot().props.map(toPublicViewerProp),
      },
    };
  }
  if (payload.type === "viewer.calibration.get") {
    return {
      ok: true,
      data: {
        calibration: toPublicCalibrationSnapshot(context.snapshot().calibration),
      },
    };
  }
  if (!payload.scopes.includes("write:props")) {
    return {
      ok: false,
      data: {},
      reason: "prop scope denied",
    };
  }
  if (payload.type === "viewer.prop.load") {
    const loaded = makeViewerApiLoadedProp(payload.data, context.snapshot().props);
    if (!loaded) {
      return {
        ok: false,
        data: { accepted: false },
        reason: "asset unavailable",
      };
    }
    const result = await context.dispatch({
      type: "props.add",
      prop: loaded,
      scopes: ["write:props"],
    });
    return result.accepted
      ? { ok: true, data: { prop: toPublicViewerProp(loaded) } }
      : commandResult(result);
  }
  if (payload.type === "viewer.prop.remove") {
    const result = await context.dispatch({
      type: "props.remove",
      propId: getViewerApiString(payload.data.propId),
      scopes: ["write:props"],
    });
    return commandResult(result);
  }
  if (payload.type === "viewer.prop.group.cycle") {
    const result = await context.dispatch({
      type: "props.cycleGroup",
      groupId: getViewerApiString(payload.data.groupId),
      direction: payload.data.direction === "previous" ? "previous" : "next",
      scopes: ["write:props"],
    });
    return result.accepted
      ? {
          ok: true,
          data: { props: context.snapshot().props.map(toPublicViewerProp) },
        }
      : commandResult(result);
  }
  if (payload.type === "viewer.prop.update") {
    const propId = getViewerApiString(payload.data.propId);
    const current = context.snapshot().props.find((prop) => prop.id === propId);
    if (!current) {
      return {
        ok: false,
        data: { accepted: false },
        reason: "prop not found",
      };
    }
    const next = applyViewerApiPropPatch(current, payload.data);
    const result = await context.dispatch({
      type: "props.update",
      prop: next,
      scopes: ["write:props"],
    });
    return result.accepted
      ? { ok: true, data: { prop: toPublicViewerProp(next) } }
      : commandResult(result);
  }
  return {
    ok: false,
    data: {},
    reason: "unsupported renderer request",
  };
}

function commandResult(result: ViewerCommandResult): ViewerApiRendererResponsePayload {
  return {
    ok: result.accepted,
    data: result.accepted ? {} : { accepted: false },
    reason: result.reason,
  };
}

function makeViewerApiLoadedProp(
  data: Record<string, unknown>,
  existingProps: ViviProp[],
): ViviProp | null {
  const source = readViewerApiInlineSource(data.source);
  if (!source) return null;
  const baseProp: ViviProp = {
    id: makeViewerApiPropId(existingProps),
    name: readViewerApiName(data.name),
    kind: "image",
    visible: true,
    drawOrder: nextViewerApiDrawOrder(existingProps),
    opacity: 1,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    anchor: {
      target: { kind: "screen" },
      offsetX: 0,
      offsetY: 0,
      rotationWeight: 0,
      scaleWeight: 0,
    },
    source,
  };
  return applyViewerApiPropPatch(baseProp, data);
}

function readViewerApiInlineSource(
  value: unknown,
): Extract<ViviProp["source"], { kind: "inlineBase64" }> | null {
  if (!isRecord(value)) throw new Error("invalid prop source");
  if (value.kind !== "inlineBase64") return null;
  if (
    typeof value.mimeType !== "string" ||
    !PUBLIC_PROP_MIME_TYPES.has(value.mimeType) ||
    typeof value.bytes !== "string"
  ) {
    throw new Error("invalid inline prop source");
  }
  return {
    kind: "inlineBase64",
    mimeType: value.mimeType as Extract<
      ViviProp["source"],
      { kind: "inlineBase64" }
    >["mimeType"],
    bytes: value.bytes,
    portable: true,
  };
}

function readViewerApiName(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, 256)
    : "API Overlay";
}

function nextViewerApiDrawOrder(existingProps: ViviProp[]): number {
  const maxDrawOrder = existingProps.reduce(
    (max, prop) => Math.max(max, prop.drawOrder),
    99,
  );
  return Math.min(10_000, maxDrawOrder + 1);
}

function makeViewerApiPropId(existingProps: ViviProp[]): string {
  const existing = new Set(existingProps.map((prop) => prop.id));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const random =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${(viewerApiPropIdCounter += 1).toString(36)}`;
    const id = `prop-api-${random}`;
    if (!existing.has(id)) return id;
  }
  return `prop-api-${Date.now().toString(36)}-${(viewerApiPropIdCounter += 1).toString(36)}`;
}

function applyViewerApiPropPatch(
  prop: ViviProp,
  data: Record<string, unknown>,
): ViviProp {
  const transformPatch = isRecord(data.transform) ? data.transform : {};
  const groupId =
    data.groupId === null || data.groupId === ""
      ? undefined
      : typeof data.groupId === "string"
        ? data.groupId
        : prop.groupId;
  return {
    ...prop,
    visible: typeof data.visible === "boolean" ? data.visible : prop.visible,
    groupId,
    opacity: finiteOr(prop.opacity, transformPatch.opacity, 0, 1),
    transform: {
      x: finiteOr(prop.transform.x, transformPatch.x, -100000, 100000),
      y: finiteOr(prop.transform.y, transformPatch.y, -100000, 100000),
      scaleX: finiteOr(prop.transform.scaleX, transformPatch.scaleX, 0.01, 100),
      scaleY: finiteOr(prop.transform.scaleY, transformPatch.scaleY, 0.01, 100),
      rotation: finiteOr(
        prop.transform.rotation,
        transformPatch.rotation,
        -36000,
        36000,
      ),
    },
    anchor: makeViewerApiAnchor(prop, data.anchor),
  };
}

function makeViewerApiAnchor(
  prop: ViviProp,
  value: unknown,
): ViviProp["anchor"] {
  if (value === null) return undefined;
  if (value === undefined) return prop.anchor;
  if (!isRecord(value)) throw new Error("invalid prop anchor");
  if (value.kind !== "screen" && value.kind !== "modelRoot") {
    throw new Error("unsupported prop anchor kind");
  }
  return {
    target: { kind: value.kind },
    offsetX: prop.anchor?.offsetX ?? 0,
    offsetY: prop.anchor?.offsetY ?? 0,
    rotationWeight: prop.anchor?.rotationWeight ?? 0,
    scaleWeight: prop.anchor?.scaleWeight ?? 0,
  };
}

export function toPublicViewerProp(prop: ViviProp): ViewerApiPublicProp {
  return {
    id: prop.id,
    name: prop.name,
    kind: prop.kind,
    visible: prop.visible,
    drawOrder: prop.drawOrder,
    opacity: prop.opacity,
    transform: { ...prop.transform },
    groupId: prop.groupId ?? null,
    anchor: prop.anchor
      ? {
          kind:
            prop.anchor.target.kind === "modelRoot" ||
            prop.anchor.target.kind === "screen"
              ? prop.anchor.target.kind
              : "publicAnchor",
        }
      : null,
    source: {
      kind: prop.source.kind,
      mimeType: prop.source.mimeType,
      portable: prop.source.portable,
      bytes: publicPropByteCount(prop),
    },
  };
}

export function toPublicCalibrationSnapshot(
  snapshot: ViviTrackingCalibrationSnapshot,
): Record<string, unknown> {
  return {
    activeProfileId: snapshot.activeProfileId,
    profileCount: snapshot.profiles.length,
    diagnostics: snapshot.diagnostics.slice(0, 32).map(
      (diagnostic): ViewerApiCalibrationDiagnosticSummary => ({
        channelId: diagnostic.channelId,
        source: diagnostic.source,
        value: diagnostic.value,
        calibrated: diagnostic.calibrated,
        clipped: diagnostic.clipped === true,
        stale: diagnostic.stale === true,
        observedMin: diagnostic.observedMin,
        observedMax: diagnostic.observedMax,
      }),
    ),
  };
}

function publicPropByteCount(prop: ViviProp): number {
  if (prop.source.kind === "inlineBase64") {
    const padding = prop.source.bytes.endsWith("==")
      ? 2
      : prop.source.bytes.endsWith("=")
        ? 1
        : 0;
    return (prop.source.bytes.length / 4) * 3 - padding;
  }
  return prop.source.bytes;
}

function finiteOr(
  fallback: number,
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getViewerApiString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
