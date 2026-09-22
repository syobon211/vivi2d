import {
  createReadOnlyAuthoringHost,
  type ReferencedAtlasResolutionRequestV1,
  type VerifiedAtlasAssetV1,
} from "@vivi2d/editor-host";
import {
  decodeRawBase64,
  encodeUtf8,
  utf8ByteLength,
} from "@vivi2d/model/internal/project-format-v11";
import { ViviPixiRenderer } from "@vivi2d/renderer-pixi";
import type { PreparedEvaluationModel } from "@vivi2d/renderer-pixi/evaluation-model";
import {
  createNativeEvaluationRuntime,
  type EvaluationCommit,
  type EvaluationFailure,
  type EvaluationParameter,
  type EvaluationSnapshot,
  type NativeEvaluationRuntime,
  type PreparedEvaluation,
} from "@vivi2d/runtime-wasm/internal/evaluation-runtime-v1";
import {
  createNativePngDecoder,
  type NativePngDecoder,
} from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";
import { localAssetCopy, type RuntimePreviewCapture } from "./local-asset-copy";

export type RuntimePreviewParameter = EvaluationParameter;
export type RuntimePreviewResult =
  | {
      ok: true;
      status: "activated" | "updated" | "superseded" | "cancelled" | "missing";
      parameters?: readonly RuntimePreviewParameter[];
      presets?: readonly string[];
      generations?: { model: string; topology: string; dynamic: string };
      cleanupFailed?: true;
    }
  | {
      ok: false;
      code:
        | "unavailable"
        | "invalid"
        | "resource"
        | "native"
        | "internal"
        | "disposed"
        | "busy";
      nativeStatus?: number;
      parameters?: readonly RuntimePreviewParameter[];
    };
export interface RuntimeEvaluationPreview {
  load(): Promise<RuntimePreviewResult>;
  setParameter(id: string, value: number, deltaSeconds?: number): RuntimePreviewResult;
  applyPreset(id: string, deltaSeconds?: number): RuntimePreviewResult;
  close(): void;
}

type CaptureOwner = { cancellation?: Promise<void> };
// The existing IPC cancellation is frame-wide, so admit only one owned capture.
let pendingCapture: CaptureOwner | undefined;

const INPUT_LIMIT = 67_108_864;
const failure = (): Error => new Error("RUNTIME_PREVIEW_INVALID");
const requireValid = (value: unknown): void => {
  if (!value) throw failure();
};
const HEX = /^[0-9a-f]{64}$/;
const DIGEST = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATLAS = /^[A-Za-z0-9_-]{1,120}$/;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireValid(value && typeof value === "object");
  const prototype = Object.getPrototypeOf(value);
  requireValid(prototype === Object.prototype || prototype === null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  requireValid(
    names.length === keys.length &&
      names.every((key) => typeof key === "string" && keys.includes(key)),
  );
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    requireValid(descriptor && "value" in descriptor);
    result[key] = descriptor!.value;
  }
  return result;
}
function array(value: unknown, maximum: number): unknown[] {
  requireValid(Array.isArray(value));
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  requireValid(Number.isSafeInteger(length) && length >= 0 && length <= maximum);
  requireValid(Reflect.ownKeys(value as object).length === length + 1);
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireValid(descriptor && "value" in descriptor);
    result.push(descriptor!.value);
  }
  return result;
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)!.get!;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
function byteView(value: unknown, maximum: number): Uint8Array<ArrayBuffer> {
  requireValid(value instanceof Uint8Array);
  const buffer = bufferGetter.call(value),
    length = byteLengthGetter.call(value),
    offset = byteOffsetGetter.call(value);
  requireValid(buffer instanceof ArrayBuffer && length <= maximum);
  return new Uint8Array(buffer, offset, length);
}
function verified(value: unknown): VerifiedAtlasAssetV1 {
  const dto = record(value, ["asset", "png"]),
    asset = record(dto.asset, [
      "objectAddress",
      "storageKind",
      "contentSha256",
      "mediaType",
      "sizeBytes",
    ]),
    png = record(dto.png, ["profile", "width", "height"]);
  requireValid(
    typeof asset.objectAddress === "string" &&
      DIGEST.test(asset.objectAddress) &&
      typeof asset.contentSha256 === "string" &&
      DIGEST.test(asset.contentSha256),
  );
  requireValid(
    (asset.storageKind === "blob" || asset.storageKind === "chunk_manifest") &&
      asset.mediaType === "image/png" &&
      Number.isSafeInteger(asset.sizeBytes) &&
      (asset.sizeBytes as number) >= 0,
  );
  requireValid(
    png.profile === "vivi2d.png.rgba8.v1" &&
      Number.isInteger(png.width) &&
      Number.isInteger(png.height) &&
      (png.width as number) >= 1 &&
      (png.width as number) <= 8192 &&
      (png.height as number) >= 1 &&
      (png.height as number) <= 8192,
  );
  return {
    asset: {
      objectAddress: (asset.objectAddress as string).toLowerCase(),
      contentSha256: (asset.contentSha256 as string).toLowerCase(),
      storageKind: asset.storageKind as "blob" | "chunk_manifest",
      mediaType: "image/png",
      sizeBytes: asset.sizeBytes as number,
    },
    png: {
      profile: "vivi2d.png.rgba8.v1",
      width: png.width as number,
      height: png.height as number,
    },
  };
}
/** Transport shape and allocation bounds only. EDH/native remain the validators. */
function captureOwned(value: unknown, cellId: string): RuntimePreviewCapture {
  const dto = record(value, [
    "kind",
    "cellId",
    "documentId",
    "commitVersion",
    "sourceBytes",
    "objects",
    "atlasResolutions",
  ]);
  requireValid(
    dto.kind === "runtimePreviewV1" &&
      dto.cellId === cellId &&
      typeof dto.documentId === "string" &&
      UUID.test(dto.documentId) &&
      Number.isSafeInteger(dto.commitVersion) &&
      (dto.commitVersion as number) >= 0,
  );
  const source = byteView(dto.sourceBytes, 134_217_728);
  let total = 0;
  const addresses = new Set<string>();
  const objects = array(dto.objects, 288).map((value) => {
    const object = record(value, ["objectAddress", "bytes"]);
    requireValid(
      typeof object.objectAddress === "string" &&
        HEX.test(object.objectAddress) &&
        !addresses.has(object.objectAddress),
    );
    addresses.add(object.objectAddress as string);
    const bytes = byteView(object.bytes, INPUT_LIMIT);
    total += bytes.byteLength;
    requireValid(total <= INPUT_LIMIT);
    return { objectAddress: object.objectAddress as string, bytes };
  });
  const atlasIds = new Set<string>();
  const atlasResolutions: RuntimePreviewCapture["atlasResolutions"] = array(
    dto.atlasResolutions,
    32,
  ).map((value) => {
    const status = Object.getOwnPropertyDescriptor(value, "status")?.value;
    requireValid(status === "ready" || status === "missing");
    const row = record(
      value,
      status === "ready" ? ["atlasId", "status", "verified"] : ["atlasId", "status"],
    );
    requireValid(
      typeof row.atlasId === "string" &&
        ATLAS.test(row.atlasId) &&
        !atlasIds.has(row.atlasId),
    );
    atlasIds.add(row.atlasId as string);
    return status === "ready"
      ? { atlasId: row.atlasId as string, status, verified: verified(row.verified) }
      : { atlasId: row.atlasId as string, status: "missing" };
  });
  // All own-field/count/aggregate bounds precede the first large copy or hash.
  return {
    kind: "runtimePreviewV1",
    cellId,
    documentId: dto.documentId as string,
    commitVersion: dto.commitVersion as number,
    sourceBytes: new Uint8Array(source),
    objects: objects.map((object) => ({
      objectAddress: object.objectAddress,
      bytes: new Uint8Array(object.bytes),
    })),
    atlasResolutions,
  };
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
function sameReference(
  request: ReferencedAtlasResolutionRequestV1,
  row: VerifiedAtlasAssetV1,
): boolean {
  return (
    request.declaredWidth === row.png.width &&
    request.declaredHeight === row.png.height &&
    request.reference.objectAddress.toLowerCase() === row.asset.objectAddress &&
    request.reference.contentSha256.toLowerCase() === row.asset.contentSha256 &&
    request.reference.storageKind === row.asset.storageKind &&
    request.reference.mediaType === row.asset.mediaType &&
    request.reference.sizeBytes === row.asset.sizeBytes
  );
}
function nativeFailure(result: EvaluationFailure): RuntimePreviewResult {
  return result.kind === "native"
    ? {
        ok: false,
        code: result.status === 6 ? "resource" : "native",
        nativeStatus: result.status,
      }
    : {
        ok: false,
        code:
          result.code === "disposed"
            ? "disposed"
            : result.code === "unavailable"
              ? "unavailable"
              : "internal",
      };
}

/** One cell-bound actual EDH, one native instance and one renderer Application. */
export async function createRuntimeEvaluationPreview(options: {
  cellId: string;
  canvas: HTMLCanvasElement;
}): Promise<RuntimeEvaluationPreview> {
  if (!HEX.test(options.cellId)) throw new Error("RUNTIME_PREVIEW_UNAVAILABLE");
  const cellId = options.cellId;
  const initialized = await createNativeEvaluationRuntime();
  if (!initialized.ok) throw new Error("RUNTIME_PREVIEW_UNAVAILABLE");
  let runtime: NativeEvaluationRuntime = initialized.value;
  let renderer: ViviPixiRenderer;
  try {
    renderer = await ViviPixiRenderer.create(options.canvas, {
      transparent: true,
      backgroundColor: 0x000000,
    });
  } catch {
    runtime.dispose();
    throw new Error("RUNTIME_PREVIEW_UNAVAILABLE");
  }
  type Attempt = {
    live: boolean;
    capture: RuntimePreviewCapture | null;
    session?: string;
    prepared?: PreparedEvaluation;
    gpu?: PreparedEvaluationModel;
    commit?: EvaluationCommit;
    decoder?: NativePngDecoder;
    rowIndex: number;
    cleanupFailed: boolean;
  };
  let closed = false,
    ownedCapture: CaptureOwner | undefined,
    current: Attempt | undefined,
    initializingAttempt: Attempt | undefined,
    initializing: Promise<void> | undefined;
  const owns = (attempt: Attempt): boolean =>
    !closed && current === attempt && attempt.live;
  const portOwner = (): Attempt => {
    const attempt = initializingAttempt;
    requireValid(attempt && owns(attempt) && attempt.capture);
    return attempt!;
  };
  const host = createReadOnlyAuthoringHost({
    registry: new Map(),
    supportedCapabilities: new Map([
      ["vivi.cap.referencedAssets", 1],
      ["vivi.cap.maskInvert", 1],
    ]),
    sha256,
    async materializeEmbeddedAtlas(request) {
      const attempt = portOwner();
      requireValid(request.imageBase64.length <= Math.ceil(16_777_216 / 3) * 4);
      const bytes = decodeRawBase64(request.imageBase64),
        hash = await sha256(bytes);
      requireValid(owns(attempt));
      if (!attempt.decoder) {
        const initialized = await createNativePngDecoder();
        if (!initialized.ok) throw failure();
        if (!owns(attempt)) {
          initialized.decoder.dispose();
          throw failure();
        }
        attempt.decoder = initialized.decoder;
      }
      const expectedSha256 = Uint8Array.from({ length: 32 }, (_, index) =>
        Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16),
      );
      const decoded = attempt.decoder.decode({
        bytes,
        expectedSha256,
        width: request.declaredWidth,
        height: request.declaredHeight,
      });
      requireValid(decoded.ok);
      const objects = attempt.capture!.objects,
        old = objects.find((object) => object.objectAddress === hash);
      if (old)
        requireValid(
          old.bytes.length === bytes.length &&
            old.bytes.every((value, index) => value === bytes[index]),
        );
      else {
        requireValid(
          objects.length < 288 &&
            objects.reduce(
              (sum, object) => sum + object.bytes.byteLength,
              bytes.byteLength,
            ) <= INPUT_LIMIT,
        );
        objects.push({ objectAddress: hash, bytes: new Uint8Array(bytes) });
      }
      return {
        asset: {
          objectAddress: hash,
          contentSha256: hash,
          storageKind: "blob",
          sizeBytes: bytes.byteLength,
          mediaType: "image/png",
        },
        png: {
          profile: "vivi2d.png.rgba8.v1",
          width: request.declaredWidth,
          height: request.declaredHeight,
        },
      };
    },
    resolveReferencedAtlas(request) {
      const attempt = portOwner(),
        row = attempt.capture!.atlasResolutions[attempt.rowIndex++];
      requireValid(row?.atlasId === request.atlasId);
      if (row!.status === "missing") return { status: "missing" };
      requireValid(
        sameReference(
          request,
          (row as Extract<typeof row, { status: "ready" }>).verified,
        ),
      );
      return {
        status: "ready",
        verified: (row as Extract<typeof row, { status: "ready" }>).verified,
      };
    },
  });
  // Real frozen host identity/methods, never caller-supplied host/session authority.
  const init = host.initUtf8,
    getSnapshot = host.getSnapshot,
    getRequestState = host.getRequestState,
    buildPayload = host.buildRuntimePayload,
    disposeSession = host.dispose;
  let observe = runtime.observeRequestState,
    prepare = runtime.prepare,
    snapshotPrepared = runtime.getPreparedSnapshot,
    snapshotActive = runtime.getSnapshot;
  let prepareCommit = runtime.prepareCommit,
    consume = runtime.commitPrepared,
    finish = runtime.finishCommit;
  function replaceRuntime(next: NativeEvaluationRuntime): void {
    runtime = next;
    observe = next.observeRequestState;
    prepare = next.prepare;
    snapshotPrepared = next.getPreparedSnapshot;
    snapshotActive = next.getSnapshot;
    prepareCommit = next.prepareCommit;
    consume = next.commitPrepared;
    finish = next.finishCommit;
  }
  const prepareGpu = renderer.prepareEvaluationModel.bind(renderer),
    validateGpu = renderer.validatePreparedEvaluation.bind(renderer),
    selectGpu = renderer.commitPreparedEvaluation.bind(renderer),
    finalizeGpu = renderer.finalizeEvaluation.bind(renderer),
    discardGpu = renderer.discardPreparedEvaluation.bind(renderer);
  function releaseSession(attempt: Attempt): void {
    if (!attempt.session) return;
    const session = attempt.session;
    attempt.session = undefined;
    try {
      disposeSession(session);
    } catch {
      attempt.cleanupFailed = true;
    }
  }
  function discard(attempt: Attempt): void {
    attempt.live = false;
    releaseSession(attempt);
    if (attempt.commit) {
      try {
        finish(attempt.commit);
      } catch {
        attempt.cleanupFailed = true;
      }
      attempt.commit = undefined;
    }
    if (attempt.gpu) {
      try {
        discardGpu(attempt.gpu);
      } catch {
        attempt.cleanupFailed = true;
      }
      attempt.gpu = undefined;
    }
    try {
      attempt.prepared?.dispose();
    } catch {
      attempt.cleanupFailed = true;
    }
    attempt.prepared = undefined;
    try {
      attempt.decoder?.dispose();
    } catch {
      attempt.cleanupFailed = true;
    }
    attempt.decoder = undefined;
    attempt.capture = null;
  }
  function resultSnapshot(
    status: "activated" | "updated",
    result: EvaluationSnapshot,
  ): RuntimePreviewResult {
    const generations = result.generations;
    return {
      ok: true,
      status,
      parameters: result.parameters,
      presets: result.presets,
      generations: generations
        ? {
            model: generations.model.toString(),
            topology: generations.topology.toString(),
            dynamic: generations.dynamic.toString(),
          }
        : undefined,
    };
  }
  function publish(attempt: Attempt): RuntimePreviewResult {
    requireValid(owns(attempt) && attempt.session && attempt.prepared?.kind === "ready");
    const snapshot = snapshotPrepared(attempt.prepared!);
    if (!snapshot.ok) {
      discard(attempt);
      return nativeFailure(snapshot);
    }
    attempt.gpu = prepareGpu(snapshot.value);
    requireValid(owns(attempt));
    const live = getSnapshot(attempt.session!);
    requireValid(
      live.requestGeneration === attempt.prepared!.requestGeneration &&
        live.guards.canRuntime,
    );
    const observed = observe(getRequestState());
    if (!observed.ok) {
      discard(attempt);
      return nativeFailure(observed);
    }
    validateGpu(attempt.gpu);
    const permitted = prepareCommit(attempt.prepared!);
    if (!permitted.ok) {
      discard(attempt);
      return nativeFailure(permitted);
    }
    attempt.commit = permitted.value;
    const pending = attempt.gpu;
    // Final event-free interval: the real consume and ordinary private reference swap.
    const status = consume(permitted.value);
    const retired = status === 0 ? selectGpu(pending) : null;
    try {
      finish(permitted.value);
    } catch {
      attempt.cleanupFailed = true;
    }
    attempt.commit = undefined;
    if (status !== 0) {
      discard(attempt);
      return status === -1
        ? { ok: true, status: "superseded" }
        : { ok: false, code: "native", nativeStatus: status };
    }
    // Nothing after publication is allowed to report rollback or discard the new owner.
    attempt.gpu = undefined;
    attempt.prepared = undefined;
    try {
      finalizeGpu(pending, retired);
    } catch {
      attempt.cleanupFailed = true;
    }
    releaseSession(attempt);
    attempt.capture = null;
    attempt.live = false;
    try {
      renderer.render();
    } catch {
      attempt.cleanupFailed = true;
    }
    try {
      const active = snapshotActive();
      const result: RuntimePreviewResult = active.ok
        ? resultSnapshot("activated", active.value)
        : {
            ok: true,
            status: "activated",
            parameters: snapshot.value.parameters,
            presets: snapshot.value.presets,
            cleanupFailed: true,
          };
      if (attempt.cleanupFailed && result.ok) result.cleanupFailed = true;
      return result;
    } catch {
      return { ok: true, status: "activated", cleanupFailed: true };
    }
  }
  function mutate(
    action: () => ReturnType<NativeEvaluationRuntime["setInput"]>,
    delta: number,
  ): RuntimePreviewResult {
    if (closed) return { ok: false, code: "disposed" };
    const set = action();
    if (!set.ok) return nativeFailure(set);
    const updated = runtime.update(delta);
    // Even a returned update failure requires fresh current/evaluated observations.
    const snapshot = snapshotActive();
    if (!snapshot.ok) return nativeFailure(snapshot);
    let pending: PreparedEvaluationModel | undefined;
    let selected = false;
    try {
      pending = prepareGpu(snapshot.value, true);
      validateGpu(pending);
      const retired = selectGpu(pending);
      selected = true;
      finalizeGpu(pending, retired);
      renderer.render();
    } catch {
      if (pending && !selected) {
        try {
          discardGpu(pending);
        } catch {
          /* Keep the incumbent selected. */
        }
      }
      return { ok: false, code: "unavailable", parameters: snapshot.value.parameters };
    }
    if (updated.ok) return resultSnapshot("updated", snapshot.value);
    return { ...nativeFailure(updated), parameters: snapshot.value.parameters };
  }
  return Object.freeze({
    async load(): Promise<RuntimePreviewResult> {
      if (closed) return { ok: false, code: "disposed" };
      if (pendingCapture) return { ok: false, code: "busy" };
      if (current) discard(current);
      const attempt: Attempt = {
        live: true,
        capture: null,
        rowIndex: 0,
        cleanupFailed: false,
      };
      current = attempt;
      const captureOwner: CaptureOwner = {};
      pendingCapture = ownedCapture = captureOwner;
      try {
        let response: RuntimePreviewCapture | null;
        try {
          response = await localAssetCopy({ operation: "preview", cellId });
        } finally {
          // A queued old cancel must settle before a new capture can be admitted.
          // Without cancellation, release synchronously (do not await undefined).
          const cancellation = captureOwner.cancellation;
          if (cancellation) await cancellation;
          if (pendingCapture === captureOwner) pendingCapture = undefined;
          if (ownedCapture === captureOwner) ownedCapture = undefined;
        }
        if (!owns(attempt)) return { ok: true, status: "superseded" };
        if (!response) {
          discard(attempt);
          return { ok: true, status: "cancelled" };
        }
        attempt.capture = captureOwned(response, cellId);
        // EDH has one fixed port pair. Serialize only its actual init interval so
        // an older async init never reads a newer attempt's physical snapshot.
        if (initializing) await initializing;
        if (!owns(attempt)) return { ok: true, status: "superseded" };
        // Only an explicit load recovers a retired native instance. The actual EDH
        // and its monotonic issuer survive, as does the incumbent GPU display.
        if (runtime.isRetired()) {
          const replacement = await createNativeEvaluationRuntime();
          if (!owns(attempt)) {
            if (replacement.ok) replacement.value.dispose();
            return { ok: true, status: "superseded" };
          }
          if (!replacement.ok) {
            discard(attempt);
            return nativeFailure(replacement);
          }
          runtime.dispose();
          replaceRuntime(replacement.value);
        }
        await renderer.recoverEvaluation();
        if (!owns(attempt)) return { ok: true, status: "superseded" };
        initializingAttempt = attempt;
        let resolveInit!: () => void;
        const barrier = new Promise<void>((resolve) => {
          resolveInit = resolve;
        });
        initializing = barrier;
        try {
          const promise = init(attempt.capture!.sourceBytes);
          const observation = observe(getRequestState());
          const initialized = await promise;
          attempt.session = initialized.sessionId;
          if (!owns(attempt)) {
            releaseSession(attempt);
            return { ok: true, status: "superseded" };
          }
          if (!observation.ok) {
            discard(attempt);
            return nativeFailure(observation);
          }
          requireValid(attempt.rowIndex === attempt.capture!.atlasResolutions.length);
          if (initialized.snapshot.assetReadiness.state === "missing") {
            discard(attempt);
            return { ok: true, status: "missing" };
          }
          const payload = buildPayload(attempt.session),
            json = JSON.stringify(payload.payload);
          requireValid(utf8ByteLength(json) <= INPUT_LIMIT);
          const prepared = prepare({
            requestGeneration: payload.requestGeneration,
            payloadUtf8: encodeUtf8(json),
            textures: payload.texturePlan.textures,
            objects: attempt.capture!.objects,
          });
          if (!prepared.ok) {
            discard(attempt);
            return nativeFailure(prepared);
          }
          attempt.prepared = prepared.value;
          if (prepared.value.kind === "missing") {
            // This UI offers Reload, not a same-seal retry with arbitrary new bytes.
            // Terminal Missing is explicitly discarded, including its EDH session.
            discard(attempt);
            return { ok: true, status: "missing" };
          }
          return publish(attempt);
        } finally {
          try {
            attempt.decoder?.dispose();
          } catch {
            attempt.cleanupFailed = true;
          }
          attempt.decoder = undefined;
          if (initializingAttempt === attempt) initializingAttempt = undefined;
          if (initializing === barrier) initializing = undefined;
          resolveInit();
        }
      } catch {
        const stale = !owns(attempt);
        discard(attempt);
        return stale
          ? { ok: true, status: "superseded" }
          : { ok: false, code: "invalid" };
      }
    },
    setParameter(id: string, value: number, deltaSeconds = 0) {
      return mutate(() => runtime.setInput(id, value), deltaSeconds);
    },
    applyPreset(id: string, deltaSeconds = 0) {
      return mutate(() => runtime.applyPreset(id), deltaSeconds);
    },
    close() {
      if (closed) return;
      closed = true;
      const captureOwner = ownedCapture;
      if (captureOwner && pendingCapture === captureOwner) {
        captureOwner.cancellation = localAssetCopy({ operation: "cancelPreview" }).then(
          () => undefined,
          () => undefined,
        );
      }
      if (current) discard(current);
      current = undefined;
      try {
        runtime.dispose();
      } catch {
        /* Close is terminal even if cleanup fails. */
      }
      try {
        renderer.destroy();
      } catch {
        /* No rollback or later draws. */
      }
    },
  });
}
