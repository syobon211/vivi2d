/** Internal executable-spec candidate; no persistence, authorization, clock or transport. */
import { MAX_VIVI_TEXT_FILE_BYTES } from "../load-limits";
import {
  canonicalizeJsonV11,
  ProjectFormatV11JsonError,
  parseJsonV11,
} from "../project-format-v11/json-contract";
import { decodeUtf8Fatal, encodeUtf8 } from "../project-format-v11/portable-primitives";
import type { Sha256V11 } from "../project-format-v11/types";
import {
  type EmbeddedRoundTripPorts,
  validateEmbeddedRoundTripV11,
} from "./project-format-v11";

export type LocalExchangeError =
  | "SHAPE"
  | "LIMIT"
  | "BINDING"
  | "INTEGRITY"
  | "PROJECT"
  | "INTERNAL"
  | "IDEMPOTENCY_MISMATCH"
  | "STATE"
  | "STALE"
  | "TERMINAL";
export type LocalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: LocalExchangeError };

export const LOCAL_EXCHANGE_LIMITS = Object.freeze({
  receipts: 64,
  attempts: 8,
  artifacts: 128,
  inputBytes: 50 * 1024 * 1024,
  resultBytes: 200 * 1024 * 1024,
  parameterBytes: 64 * 1024,
  parameterNodes: 1024,
  parameterDepth: 8,
});
type Limits = { -readonly [Key in keyof typeof LOCAL_EXCHANGE_LIMITS]: number };
export type LocalTestLimits = Partial<Limits>;
export interface LocalArtifact {
  readonly id: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly sha256: string;
}
export interface LocalBlob {
  readonly id: string;
  readonly bytes: Uint8Array;
}
export interface LocalResultPolicy {
  readonly maxArtifacts: number;
  readonly maxBytes: number;
}
export interface LocalSubmissionRequest {
  readonly scopeId: string;
  readonly submissionKey: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly maxAttempts: number;
  readonly resultPolicy: LocalResultPolicy;
  readonly artifacts: readonly LocalArtifact[];
  readonly blobs: readonly LocalBlob[];
  readonly parametersUtf8: Uint8Array;
}
export interface PreparedSubmission {
  readonly scopeId: string;
  readonly submissionKey: string;
  readonly jobId: string;
  readonly submissionSha256: string;
  readonly inputManifestSha256: string;
  readonly parametersSha256: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly maxAttempts: number;
  readonly resultPolicy: LocalResultPolicy;
}
export interface LocalResultRequest {
  readonly jobId: string;
  readonly submissionSha256: string;
  readonly attempt: number;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly artifacts: readonly LocalArtifact[];
  readonly blobs: readonly LocalBlob[];
}
export interface PreparedJobResult extends Omit<LocalResultRequest, "blobs"> {
  readonly resultSha256: string;
}
export interface LocalRevisionRequest {
  readonly scopeId: string;
  readonly documentId: string;
  readonly parentRevisionId: string | null;
  readonly documentUtf8: Uint8Array;
}
export interface PreparedRevision extends Omit<LocalRevisionRequest, "documentUtf8"> {
  readonly revisionId: string;
  readonly documentSha256: string;
}
export interface PreparedAcceptance {
  readonly jobId: string;
  readonly submissionSha256: string;
  readonly attempt: number;
  readonly resultSha256: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly revision: PreparedRevision;
}
export interface LocalHead {
  readonly revisionId: string | null;
  readonly version: number;
}
export interface LocalReceipt {
  readonly mutationId: string;
  readonly expectedHead: LocalHead;
  readonly revisionId: string;
  readonly outcome: "published" | "conflict";
  readonly observedHead: LocalHead;
}
export interface LocalSyncState {
  readonly scopeId: string;
  readonly documentId: string;
  readonly head: LocalHead;
  readonly receipts: readonly LocalReceipt[];
}
export interface LocalPublishRequest {
  readonly scopeId: string;
  readonly documentId: string;
  readonly mutationId: string;
  readonly expectedHead: LocalHead;
  readonly revision: PreparedRevision;
}
// Prepared* shapes in state are metadata snapshots, not preparation proofs.
// Retain the original prepare* handles (including a prepared acceptance's
// revision) for proof-taking operations; copied/restored state cannot mint them.
export interface LocalJobState {
  readonly submission: PreparedSubmission;
  readonly phase:
    | "queued"
    | "running"
    | "retryable"
    | "succeeded"
    | "failed"
    | "cancelled";
  readonly stateVersion: number;
  readonly attempt: number;
  readonly active: {
    readonly providerId: string;
    readonly providerVersion: string;
    readonly renewal: number;
  } | null;
  readonly result: PreparedJobResult | null;
  readonly failure: "permanent" | "exhausted" | null;
  readonly decision:
    | { readonly kind: "undecided" | "rejected" }
    | { readonly kind: "accepted"; readonly acceptance: PreparedAcceptance };
}
export type LocalJobCommand =
  | {
      readonly kind: "claim";
      readonly providerId: string;
      readonly providerVersion: string;
    }
  | {
      readonly kind: "heartbeat" | "expire";
      readonly attempt: number;
      readonly renewal: number;
    }
  | {
      readonly kind: "failAttempt";
      readonly attempt: number;
      readonly reason: "retryable" | "permanent";
    }
  | { readonly kind: "retry" | "cancel" | "reject" }
  | { readonly kind: "complete"; readonly result: PreparedJobResult }
  | { readonly kind: "accept"; readonly acceptance: PreparedAcceptance };

// No serialized object can reconstitute these process-local preparation proofs.
const submissions = new WeakMap<object, PreparedSubmission>();
const results = new WeakMap<
  object,
  { metadata: PreparedJobResult; blobs: ReadonlyMap<string, Uint8Array> }
>();
const revisions = new WeakMap<object, PreparedRevision>();
const acceptances = new WeakMap<object, PreparedAcceptance>();
class Rejection {
  constructor(readonly code: LocalExchangeError) {}
}
function reject(code: LocalExchangeError): never {
  throw new Rejection(code);
}
function failure(error: unknown): {
  readonly ok: false;
  readonly code: LocalExchangeError;
} {
  return Object.freeze({
    ok: false,
    code: error instanceof Rejection ? error.code : "INTERNAL",
  });
}
function complete<T>(value: T): LocalResult<T> {
  return Object.freeze({ ok: true, value });
}
function transition<T>(run: () => T): LocalResult<T> {
  try {
    return complete(run());
  } catch (error) {
    return failure(error);
  }
}
async function preparation<T>(run: () => Promise<T>): Promise<LocalResult<T>> {
  try {
    return complete(await run());
  } catch (error) {
    return failure(error);
  }
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    reject("SHAPE");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject("SHAPE");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) reject("SHAPE");
  const owned: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      reject("SHAPE");
    owned[key] = descriptor.value;
  }
  return owned;
}
function list(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value)) reject("SHAPE");
  if (value.length > limit) reject("LIMIT");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) reject("SHAPE");
  const copy: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = descriptors[String(i)];
    if (!item || !("value" in item) || !item.enumerable) reject("SHAPE");
    copy.push(item.value);
  }
  return copy;
}
function identifier(value: unknown, label = false): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !(label ? /^[A-Za-z0-9._-]+$/ : /^[A-Za-z0-9_-]+$/).test(value)
  )
    reject("SHAPE");
  return value;
}
function documentIdentity(value: unknown): string {
  // The supported embedded Project candidate owns this UUID-v4 spelling.
  // Full Project validation is still mandatory before minting a revision.
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    reject("SHAPE");
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) reject("SHAPE");
  return value;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER, min = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    reject("LIMIT");
  return value;
}
function increment(value: number): number {
  return integer(value + 1);
}
function resolveLimits(input?: LocalTestLimits): Limits {
  if (input === undefined) return LOCAL_EXCHANGE_LIMITS;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const resolved: Limits = { ...LOCAL_EXCHANGE_LIMITS };
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !Object.hasOwn(resolved, key)) reject("SHAPE");
    const field = key as keyof Limits;
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) reject("SHAPE");
    resolved[field] = integer(descriptor.value, resolved[field], 1);
  }
  return Object.freeze(resolved);
}
function bytes(value: unknown, limit: number): Uint8Array {
  if (!(value instanceof Uint8Array)) reject("SHAPE");
  const size = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    "byteLength",
  )?.get?.call(value);
  integer(size, limit);
  const owned = new Uint8Array(size);
  Uint8Array.prototype.set.call(owned, value);
  return owned;
}
function hashPort(value: Sha256V11): Sha256V11 {
  if (typeof value !== "function") reject("SHAPE");
  return value;
}
async function hash(sha256: Sha256V11, input: Uint8Array): Promise<string> {
  const output = await sha256(new Uint8Array(input));
  if (typeof output !== "string" || !/^[a-f0-9]{64}$/.test(output)) reject("INTERNAL");
  return output;
}
async function envelope(sha256: Sha256V11, value: unknown): Promise<string> {
  return hash(sha256, encodeUtf8(canonicalizeJsonV11(value)));
}
function lookup<T>(map: WeakMap<object, T>, value: unknown): T {
  if (!value || typeof value !== "object") reject("BINDING");
  const known = map.get(value);
  if (!known) reject("BINDING");
  return known;
}
function policy(value: unknown, limits: Limits): LocalResultPolicy {
  const item = record(value, ["maxArtifacts", "maxBytes"]);
  return Object.freeze({
    maxArtifacts: integer(item.maxArtifacts, limits.artifacts, 1),
    maxBytes: integer(item.maxBytes, limits.resultBytes, 1),
  });
}
function artifact(value: unknown, byteLimit: number): LocalArtifact {
  const item = record(value, ["id", "mediaType", "byteLength", "sha256"]);
  if (
    typeof item.mediaType !== "string" ||
    item.mediaType.length > 127 ||
    !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(item.mediaType)
  )
    reject("SHAPE");
  return Object.freeze({
    id: identifier(item.id),
    mediaType: item.mediaType,
    byteLength: integer(item.byteLength, byteLimit),
    sha256: digest(item.sha256),
  });
}
function artifactList(
  value: unknown,
  count: number,
  maxBytes: number,
): readonly LocalArtifact[] {
  const items = list(value, count).map((item) => artifact(item, maxBytes));
  const seen = new Set<string>();
  let total = 0;
  for (const item of items) {
    total = integer(total + item.byteLength, maxBytes);
    if (seen.has(item.id)) reject("BINDING");
    seen.add(item.id);
  }
  return Object.freeze(items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
function closure(
  descriptors: unknown,
  payloads: unknown,
  count: number,
  maxBytes: number,
) {
  const artifacts = artifactList(descriptors, count, maxBytes);
  const items = list(payloads, count).map((item) => record(item, ["id", "bytes"]));
  // Preflight actual sizes and the entire closure before copying any payload.
  const found = new Map<string, Uint8Array>();
  let total = 0;
  for (const item of items) {
    const id = identifier(item.id);
    if (found.has(id)) reject("BINDING");
    if (!(item.bytes instanceof Uint8Array)) reject("SHAPE");
    const size = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    )?.get?.call(item.bytes);
    total = integer(total + integer(size, maxBytes), maxBytes);
    found.set(id, item.bytes);
  }
  if (found.size !== artifacts.length) reject("INTEGRITY");
  const blobs = new Map<string, Uint8Array>();
  for (const item of artifacts) {
    const payload = found.get(item.id);
    if (!payload) reject("INTEGRITY");
    const owned = bytes(payload, maxBytes);
    if (owned.length !== item.byteLength) reject("INTEGRITY");
    blobs.set(item.id, owned);
  }
  return { artifacts, blobs };
}
async function verifyClosure(owned: ReturnType<typeof closure>, sha256: Sha256V11) {
  for (const item of owned.artifacts) {
    const payload = owned.blobs.get(item.id);
    if (!payload || (await hash(sha256, payload)) !== item.sha256) reject("INTEGRITY");
  }
}
function parameters(input: unknown, limits: Limits): unknown {
  const owned = bytes(input, limits.parameterBytes);
  try {
    const parsed = parseJsonV11(decodeUtf8Fatal(owned), {
      testLimits: {
        maxInputUtf8Bytes: limits.parameterBytes,
        maxContainerDepth: limits.parameterDepth,
        maxTokens: limits.parameterNodes * 4,
        maxDecodedStringUtf8Bytes: limits.parameterBytes,
      },
    });
    let nodes = 0;
    const count = (value: unknown): void => {
      if (++nodes > limits.parameterNodes) reject("LIMIT");
      if (Array.isArray(value)) {
        for (const child of value) count(child);
      } else if (value !== null && typeof value === "object") {
        for (const child of Object.values(value)) count(child);
      }
    };
    count(parsed);
    if (encodeUtf8(canonicalizeJsonV11(parsed)).length > limits.parameterBytes)
      reject("LIMIT");
    return parsed;
  } catch (error) {
    if (error instanceof Rejection) throw error;
    if (
      error instanceof ProjectFormatV11JsonError &&
      [
        "VIVI_FMT_JSON_TOO_LARGE",
        "VIVI_FMT_DEPTH_EXCEEDED",
        "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
        "VIVI_FMT_STRING_TOO_LARGE",
      ].includes(error.code)
    )
      reject("LIMIT");
    reject("SHAPE");
  }
}

export async function prepareJobSubmission(
  input: LocalSubmissionRequest,
  sha256: Sha256V11,
  testLimits?: LocalTestLimits,
): Promise<LocalResult<PreparedSubmission>> {
  return preparation(async () => {
    const request = record(input, [
      "scopeId",
      "submissionKey",
      "capabilityId",
      "capabilityVersion",
      "maxAttempts",
      "resultPolicy",
      "artifacts",
      "blobs",
      "parametersUtf8",
    ]);
    const limits = resolveLimits(testLimits);
    const sha = hashPort(sha256);
    const scopeId = identifier(request.scopeId),
      submissionKey = identifier(request.submissionKey);
    const capabilityId = identifier(request.capabilityId, true),
      capabilityVersion = identifier(request.capabilityVersion, true);
    const maxAttempts = integer(request.maxAttempts, limits.attempts, 1);
    const resultPolicy = policy(request.resultPolicy, limits);
    const params = parameters(request.parametersUtf8, limits);
    const owned = closure(
      request.artifacts,
      request.blobs,
      limits.artifacts,
      limits.inputBytes,
    );
    await verifyClosure(owned, sha);
    const inputManifestSha256 = await envelope(sha, {
      kind: "vivi2d.local.job-inputs.v0",
      artifacts: owned.artifacts,
    });
    const parametersSha256 = await envelope(sha, {
      kind: "vivi2d.local.job-parameters.v0",
      parameters: params,
    });
    const jobId = await envelope(sha, {
      kind: "vivi2d.local.job-id.v0",
      scopeId,
      submissionKey,
    });
    const binding = {
      scopeId,
      submissionKey,
      capabilityId,
      capabilityVersion,
      inputManifestSha256,
      parametersSha256,
      maxAttempts,
      resultPolicy,
    };
    const submissionSha256 = await envelope(sha, {
      kind: "vivi2d.local.job-submission.v0",
      ...binding,
    });
    const handle = Object.freeze({ ...binding, jobId, submissionSha256 });
    submissions.set(handle, handle);
    return handle;
  });
}

export async function prepareJobResult(
  submission: PreparedSubmission,
  input: LocalResultRequest,
  sha256: Sha256V11,
  testLimits?: LocalTestLimits,
): Promise<LocalResult<PreparedJobResult>> {
  return preparation(async () => {
    const request = record(input, [
      "jobId",
      "submissionSha256",
      "attempt",
      "providerId",
      "providerVersion",
      "capabilityId",
      "capabilityVersion",
      "artifacts",
      "blobs",
    ]);
    const limits = resolveLimits(testLimits),
      sha = hashPort(sha256);
    const binding = {
      jobId: digest(request.jobId),
      submissionSha256: digest(request.submissionSha256),
      attempt: integer(request.attempt, limits.attempts, 1),
      providerId: identifier(request.providerId, true),
      providerVersion: identifier(request.providerVersion, true),
      capabilityId: identifier(request.capabilityId, true),
      capabilityVersion: identifier(request.capabilityVersion, true),
    };
    const prepared = lookup(submissions, submission);
    if (
      binding.jobId !== prepared.jobId ||
      binding.submissionSha256 !== prepared.submissionSha256 ||
      binding.capabilityId !== prepared.capabilityId ||
      binding.capabilityVersion !== prepared.capabilityVersion ||
      binding.attempt > prepared.maxAttempts
    )
      reject("BINDING");
    const owned = closure(
      request.artifacts,
      request.blobs,
      Math.min(limits.artifacts, prepared.resultPolicy.maxArtifacts),
      Math.min(limits.resultBytes, prepared.resultPolicy.maxBytes),
    );
    await verifyClosure(owned, sha);
    const metadata = Object.freeze({
      ...binding,
      artifacts: owned.artifacts,
      resultSha256: await envelope(sha, {
        kind: "vivi2d.local.job-result.v0",
        ...binding,
        artifacts: owned.artifacts,
      }),
    });
    results.set(metadata, { metadata, blobs: owned.blobs });
    return metadata;
  });
}

function revisionRequest(input: unknown) {
  const request = record(input, [
    "scopeId",
    "documentId",
    "parentRevisionId",
    "documentUtf8",
  ]);
  return {
    scopeId: identifier(request.scopeId),
    documentId: documentIdentity(request.documentId),
    parentRevisionId:
      request.parentRevisionId === null ? null : digest(request.parentRevisionId),
    documentUtf8: bytes(request.documentUtf8, MAX_VIVI_TEXT_FILE_BYTES),
  };
}
function projectPorts(input: EmbeddedRoundTripPorts): EmbeddedRoundTripPorts {
  const ports = record(input, ["sha256", "verifyPng"]);
  if (typeof ports.verifyPng !== "function") reject("SHAPE");
  const sha = hashPort(ports.sha256 as Sha256V11);
  const verify = ports.verifyPng as EmbeddedRoundTripPorts["verifyPng"];
  return {
    sha256: (input) => sha(new Uint8Array(input)),
    verifyPng: (input, width, height) => verify(new Uint8Array(input), width, height),
  };
}
async function prepareRevisionOwned(
  request: ReturnType<typeof revisionRequest>,
  ports: EmbeddedRoundTripPorts,
): Promise<PreparedRevision> {
  const validated = await validateEmbeddedRoundTripV11(
    new Uint8Array(request.documentUtf8),
    ports,
  );
  if (
    !validated.ok ||
    validated.documentId !== request.documentId ||
    validated.canonicalUtf8.length !== request.documentUtf8.length ||
    !request.documentUtf8.every(
      (value, index) => value === validated.canonicalUtf8[index],
    )
  )
    reject("PROJECT");
  const documentSha256 = await hash(ports.sha256, request.documentUtf8);
  const binding = {
    scopeId: request.scopeId,
    documentId: request.documentId,
    parentRevisionId: request.parentRevisionId,
    documentSha256,
  };
  const handle = Object.freeze({
    ...binding,
    revisionId: await envelope(ports.sha256, {
      kind: "vivi2d.local.revision.v0",
      ...binding,
    }),
  });
  revisions.set(handle, handle);
  return handle;
}
export async function prepareEmbeddedRevision(
  input: LocalRevisionRequest,
  ports: EmbeddedRoundTripPorts,
): Promise<LocalResult<PreparedRevision>> {
  return preparation(async () => {
    const owned = revisionRequest(input),
      ownedPorts = projectPorts(ports);
    return prepareRevisionOwned(owned, ownedPorts);
  });
}

function head(input: unknown): LocalHead {
  const value = record(input, ["revisionId", "version"]);
  const revisionId = value.revisionId === null ? null : digest(value.revisionId),
    version = integer(value.version);
  if ((revisionId === null) !== (version === 0)) reject("SHAPE");
  return Object.freeze({ revisionId, version });
}
function same(a: unknown, b: unknown): boolean {
  return canonicalizeJsonV11(a) === canonicalizeJsonV11(b);
}
function syncState(input: unknown, limits: Limits): LocalSyncState {
  const state = record(input, ["scopeId", "documentId", "head", "receipts"]);
  const seen = new Set<string>();
  const receipts = list(state.receipts, limits.receipts).map((entry): LocalReceipt => {
    const item = record(entry, [
      "mutationId",
      "expectedHead",
      "revisionId",
      "outcome",
      "observedHead",
    ]);
    const mutationId = identifier(item.mutationId);
    if (seen.has(mutationId)) reject("SHAPE");
    seen.add(mutationId);
    if (item.outcome !== "published" && item.outcome !== "conflict") reject("SHAPE");
    const expectedHead = head(item.expectedHead),
      observedHead = head(item.observedHead),
      revisionId = digest(item.revisionId);
    if (
      item.outcome === "published" &&
      (observedHead.revisionId !== revisionId ||
        observedHead.version !== expectedHead.version + 1)
    )
      reject("SHAPE");
    if (item.outcome === "conflict" && same(expectedHead, observedHead)) reject("SHAPE");
    return Object.freeze({
      mutationId,
      expectedHead,
      revisionId,
      outcome: item.outcome,
      observedHead,
    });
  });
  return Object.freeze({
    scopeId: identifier(state.scopeId),
    documentId: documentIdentity(state.documentId),
    head: head(state.head),
    receipts: Object.freeze(receipts),
  });
}
export function createLocalSyncState(
  scopeId: string,
  documentId: string,
): LocalResult<LocalSyncState> {
  return transition(() =>
    Object.freeze({
      scopeId: identifier(scopeId),
      documentId: documentIdentity(documentId),
      head: Object.freeze({ revisionId: null, version: 0 }),
      receipts: Object.freeze([]),
    }),
  );
}
export function publishLocalRevision(
  input: LocalSyncState,
  command: LocalPublishRequest,
  testLimits?: LocalTestLimits,
): LocalResult<{ readonly state: LocalSyncState; readonly receipt: LocalReceipt }> {
  return transition(() => {
    const limits = resolveLimits(testLimits),
      state = syncState(input, limits);
    const request = record(command, [
      "scopeId",
      "documentId",
      "mutationId",
      "expectedHead",
      "revision",
    ]);
    const scopeId = identifier(request.scopeId),
      documentId = documentIdentity(request.documentId);
    const mutationId = identifier(request.mutationId),
      expectedHead = head(request.expectedHead);
    const revision = lookup(revisions, request.revision);
    if (
      scopeId !== state.scopeId ||
      documentId !== state.documentId ||
      revision.scopeId !== scopeId ||
      revision.documentId !== documentId ||
      revision.parentRevisionId !== expectedHead.revisionId
    )
      reject("BINDING");
    const previous = state.receipts.find((receipt) => receipt.mutationId === mutationId);
    if (previous) {
      if (
        previous.revisionId !== revision.revisionId ||
        !same(previous.expectedHead, expectedHead)
      )
        reject("IDEMPOTENCY_MISMATCH");
      return Object.freeze({ state, receipt: previous });
    }
    if (state.receipts.length >= limits.receipts) reject("LIMIT");
    const matches = same(expectedHead, state.head);
    const nextHead = matches
      ? Object.freeze({
          revisionId: revision.revisionId,
          version: increment(state.head.version),
        })
      : state.head;
    const receipt: LocalReceipt = Object.freeze({
      mutationId,
      expectedHead,
      revisionId: revision.revisionId,
      outcome: matches ? "published" : "conflict",
      observedHead: nextHead,
    });
    return Object.freeze({
      state: Object.freeze({
        ...state,
        head: nextHead,
        receipts: Object.freeze([...state.receipts, receipt]),
      }),
      receipt,
    });
  });
}

// These metadata readers validate state without registering WeakMap handles.
function submissionMetadata(input: unknown): PreparedSubmission {
  const item = record(input, [
    "scopeId",
    "submissionKey",
    "jobId",
    "submissionSha256",
    "inputManifestSha256",
    "parametersSha256",
    "capabilityId",
    "capabilityVersion",
    "maxAttempts",
    "resultPolicy",
  ]);
  return Object.freeze({
    scopeId: identifier(item.scopeId),
    submissionKey: identifier(item.submissionKey),
    jobId: digest(item.jobId),
    submissionSha256: digest(item.submissionSha256),
    inputManifestSha256: digest(item.inputManifestSha256),
    parametersSha256: digest(item.parametersSha256),
    capabilityId: identifier(item.capabilityId, true),
    capabilityVersion: identifier(item.capabilityVersion, true),
    maxAttempts: integer(item.maxAttempts, LOCAL_EXCHANGE_LIMITS.attempts, 1),
    resultPolicy: policy(item.resultPolicy, LOCAL_EXCHANGE_LIMITS),
  });
}
function resultMetadata(
  input: unknown,
  submission: PreparedSubmission,
): PreparedJobResult {
  const item = record(input, [
    "jobId",
    "submissionSha256",
    "attempt",
    "providerId",
    "providerVersion",
    "capabilityId",
    "capabilityVersion",
    "artifacts",
    "resultSha256",
  ]);
  const result = Object.freeze({
    jobId: digest(item.jobId),
    submissionSha256: digest(item.submissionSha256),
    attempt: integer(item.attempt, submission.maxAttempts, 1),
    providerId: identifier(item.providerId, true),
    providerVersion: identifier(item.providerVersion, true),
    capabilityId: identifier(item.capabilityId, true),
    capabilityVersion: identifier(item.capabilityVersion, true),
    artifacts: artifactList(
      item.artifacts,
      submission.resultPolicy.maxArtifacts,
      submission.resultPolicy.maxBytes,
    ),
    resultSha256: digest(item.resultSha256),
  });
  if (
    result.jobId !== submission.jobId ||
    result.submissionSha256 !== submission.submissionSha256 ||
    result.capabilityId !== submission.capabilityId ||
    result.capabilityVersion !== submission.capabilityVersion
  )
    reject("BINDING");
  return result;
}
function acceptanceMetadata(
  input: unknown,
  result: PreparedJobResult,
): PreparedAcceptance {
  const item = record(input, [
    "jobId",
    "submissionSha256",
    "attempt",
    "resultSha256",
    "artifactId",
    "artifactSha256",
    "revision",
  ]);
  const raw = record(item.revision, [
    "scopeId",
    "documentId",
    "parentRevisionId",
    "documentSha256",
    "revisionId",
  ]);
  const revision = Object.freeze({
    scopeId: identifier(raw.scopeId),
    documentId: documentIdentity(raw.documentId),
    parentRevisionId: raw.parentRevisionId === null ? null : digest(raw.parentRevisionId),
    documentSha256: digest(raw.documentSha256),
    revisionId: digest(raw.revisionId),
  });
  const value = Object.freeze({
    jobId: digest(item.jobId),
    submissionSha256: digest(item.submissionSha256),
    attempt: integer(item.attempt, LOCAL_EXCHANGE_LIMITS.attempts, 1),
    resultSha256: digest(item.resultSha256),
    artifactId: identifier(item.artifactId),
    artifactSha256: digest(item.artifactSha256),
    revision,
  });
  if (
    value.jobId !== result.jobId ||
    value.submissionSha256 !== result.submissionSha256 ||
    value.attempt !== result.attempt ||
    value.resultSha256 !== result.resultSha256 ||
    !result.artifacts.some(
      (artifact) =>
        artifact.id === value.artifactId && artifact.sha256 === value.artifactSha256,
    ) ||
    revision.documentSha256 !== value.artifactSha256
  )
    reject("BINDING");
  return value;
}
function jobState(input: unknown): LocalJobState {
  const item = record(input, [
    "submission",
    "phase",
    "stateVersion",
    "attempt",
    "active",
    "result",
    "failure",
    "decision",
  ]);
  const submission = submissionMetadata(item.submission);
  const phase = item.phase;
  if (
    phase !== "queued" &&
    phase !== "running" &&
    phase !== "retryable" &&
    phase !== "succeeded" &&
    phase !== "failed" &&
    phase !== "cancelled"
  )
    reject("SHAPE");
  const attempt = integer(item.attempt, submission.maxAttempts),
    stateVersion = integer(item.stateVersion);
  let active: LocalJobState["active"] = null;
  if (item.active !== null) {
    const value = record(item.active, ["providerId", "providerVersion", "renewal"]);
    active = Object.freeze({
      providerId: identifier(value.providerId, true),
      providerVersion: identifier(value.providerVersion, true),
      renewal: integer(value.renewal),
    });
  }
  const result = item.result === null ? null : resultMetadata(item.result, submission);
  if (
    (phase === "running") !== (active !== null) ||
    (phase === "succeeded") !== (result !== null) ||
    ((phase === "running" ||
      phase === "retryable" ||
      phase === "succeeded" ||
      phase === "failed") &&
      attempt === 0) ||
    (result !== null && result.attempt !== attempt) ||
    (phase === "retryable" && attempt >= submission.maxAttempts)
  )
    reject("SHAPE");
  const reason = item.failure;
  if (
    phase === "failed"
      ? reason !== "permanent" && reason !== "exhausted"
      : reason !== null
  )
    reject("SHAPE");
  if (reason === "exhausted" && attempt !== submission.maxAttempts) reject("SHAPE");
  const rawDecision = item.decision as Record<string, unknown> | null;
  if (!rawDecision || typeof rawDecision !== "object") reject("SHAPE");
  const kindDescriptor = Object.getOwnPropertyDescriptor(rawDecision, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor)) reject("SHAPE");
  let decision: LocalJobState["decision"];
  if (kindDescriptor.value === "accepted") {
    const value = record(rawDecision, ["kind", "acceptance"]);
    if (!result) reject("SHAPE");
    decision = Object.freeze({
      kind: "accepted",
      acceptance: acceptanceMetadata(value.acceptance, result),
    });
  } else {
    const value = record(rawDecision, ["kind"]);
    if (value.kind !== "undecided" && value.kind !== "rejected") reject("SHAPE");
    decision = Object.freeze({ kind: value.kind });
  }
  if (phase !== "succeeded" && decision.kind !== "undecided") reject("SHAPE");
  return Object.freeze({
    submission,
    phase,
    stateVersion,
    attempt,
    active,
    result,
    failure: reason as LocalJobState["failure"],
    decision,
  });
}
export function submitLocalJob(
  input: LocalJobState | null,
  prepared: PreparedSubmission,
): LocalResult<LocalJobState> {
  return transition(() => {
    const submission = lookup(submissions, prepared);
    if (input !== null) {
      const state = jobState(input);
      if (
        state.submission.scopeId !== submission.scopeId ||
        state.submission.submissionKey !== submission.submissionKey
      )
        reject("BINDING");
      if (!same(state.submission, submission)) reject("IDEMPOTENCY_MISMATCH");
      return state;
    }
    return Object.freeze({
      submission,
      phase: "queued",
      stateVersion: 0,
      attempt: 0,
      active: null,
      result: null,
      failure: null,
      decision: Object.freeze({ kind: "undecided" }),
    });
  });
}
function running(
  state: LocalJobState,
  attempt: number,
): NonNullable<LocalJobState["active"]> {
  if (
    state.phase === "succeeded" ||
    state.phase === "failed" ||
    state.phase === "cancelled"
  )
    reject("TERMINAL");
  if (state.phase !== "running" || state.attempt !== attempt || !state.active)
    reject("STALE");
  return state.active;
}
export function transitionLocalJob(
  input: LocalJobState,
  command: LocalJobCommand,
): LocalResult<LocalJobState> {
  return transition(() => {
    const state = jobState(input);
    const descriptor =
      command && typeof command === "object"
        ? Object.getOwnPropertyDescriptor(command, "kind")
        : undefined;
    if (!descriptor || !("value" in descriptor)) reject("SHAPE");
    const kind: unknown = descriptor.value;
    let changes: Partial<LocalJobState>;
    if (kind === "claim") {
      const request = record(command, ["kind", "providerId", "providerVersion"]);
      const providerId = identifier(request.providerId, true),
        providerVersion = identifier(request.providerVersion, true);
      if (
        state.phase === "succeeded" ||
        state.phase === "failed" ||
        state.phase === "cancelled"
      )
        reject("TERMINAL");
      if (state.phase !== "queued") reject("STATE");
      if (state.attempt >= state.submission.maxAttempts) reject("LIMIT");
      changes = {
        phase: "running",
        attempt: state.attempt + 1,
        active: Object.freeze({ providerId, providerVersion, renewal: 0 }),
      };
    } else if (kind === "heartbeat" || kind === "expire") {
      const request = record(command, ["kind", "attempt", "renewal"]);
      const attempt = integer(request.attempt, state.submission.maxAttempts, 1),
        renewal = integer(request.renewal);
      const active = running(state, attempt);
      if (renewal !== active.renewal) reject("STALE");
      changes =
        kind === "heartbeat"
          ? { active: Object.freeze({ ...active, renewal: increment(renewal) }) }
          : {
              active: null,
              phase: attempt < state.submission.maxAttempts ? "retryable" : "failed",
              failure: attempt < state.submission.maxAttempts ? null : "exhausted",
            };
    } else if (kind === "failAttempt") {
      const request = record(command, ["kind", "attempt", "reason"]);
      const attempt = integer(request.attempt, state.submission.maxAttempts, 1);
      if (request.reason !== "retryable" && request.reason !== "permanent")
        reject("SHAPE");
      running(state, attempt);
      const retryable =
        request.reason === "retryable" && attempt < state.submission.maxAttempts;
      changes = {
        active: null,
        phase: retryable ? "retryable" : "failed",
        failure: retryable
          ? null
          : request.reason === "permanent"
            ? "permanent"
            : "exhausted",
      };
    } else if (kind === "complete") {
      const request = record(command, ["kind", "result"]);
      const result = lookup(results, request.result).metadata;
      resultMetadata(result, state.submission);
      if (state.phase === "succeeded") {
        if (same(state.result, result)) return state;
        reject("TERMINAL");
      }
      const active = running(state, result.attempt);
      if (
        active.providerId !== result.providerId ||
        active.providerVersion !== result.providerVersion
      )
        reject("BINDING");
      changes = { phase: "succeeded", active: null, result };
    } else if (kind === "accept") {
      const request = record(command, ["kind", "acceptance"]);
      const acceptance = lookup(acceptances, request.acceptance);
      if (state.phase !== "succeeded" || !state.result)
        reject(
          state.phase === "failed" || state.phase === "cancelled" ? "TERMINAL" : "STATE",
        );
      acceptanceMetadata(acceptance, state.result);
      if (
        state.decision.kind === "accepted" &&
        same(state.decision.acceptance, acceptance)
      )
        return state;
      if (state.decision.kind !== "undecided") reject("TERMINAL");
      changes = { decision: Object.freeze({ kind: "accepted", acceptance }) };
    } else if (kind === "retry" || kind === "cancel" || kind === "reject") {
      record(command, ["kind"]);
      if (kind === "reject") {
        if (state.phase !== "succeeded")
          reject(
            state.phase === "failed" || state.phase === "cancelled"
              ? "TERMINAL"
              : "STATE",
          );
        if (state.decision.kind === "rejected") return state;
        if (state.decision.kind !== "undecided") reject("TERMINAL");
        changes = { decision: Object.freeze({ kind: "rejected" }) };
      } else {
        if (
          state.phase === "succeeded" ||
          state.phase === "failed" ||
          state.phase === "cancelled"
        )
          reject("TERMINAL");
        if (kind === "retry" && state.phase !== "retryable") reject("STATE");
        changes = { phase: kind === "retry" ? "queued" : "cancelled", active: null };
      }
    } else reject("SHAPE");
    return Object.freeze({
      ...state,
      ...changes,
      stateVersion: increment(state.stateVersion),
    });
  });
}

export async function prepareJobAcceptance(
  input: LocalJobState,
  prepared: PreparedJobResult,
  command: {
    readonly artifactId: string;
    readonly scopeId: string;
    readonly documentId: string;
    readonly parentRevisionId: string | null;
  },
  ports: EmbeddedRoundTripPorts,
): Promise<LocalResult<PreparedAcceptance>> {
  return preparation(async () => {
    const state = jobState(input),
      ownedResult = lookup(results, prepared);
    const request = record(command, [
      "artifactId",
      "scopeId",
      "documentId",
      "parentRevisionId",
    ]);
    const artifactId = identifier(request.artifactId),
      scopeId = identifier(request.scopeId),
      documentId = documentIdentity(request.documentId);
    const parentRevisionId =
      request.parentRevisionId === null ? null : digest(request.parentRevisionId);
    const ownedPorts = projectPorts(ports);
    if (state.phase !== "succeeded" || !state.result) reject("STATE");
    if (!same(state.result, ownedResult.metadata)) reject("BINDING");
    const selected = ownedResult.metadata.artifacts.find(
      (artifact) => artifact.id === artifactId,
    );
    const documentUtf8 = ownedResult.blobs.get(artifactId);
    if (!selected || !documentUtf8) reject("BINDING");
    const revision = await prepareRevisionOwned(
      { scopeId, documentId, parentRevisionId, documentUtf8 },
      ownedPorts,
    );
    if (revision.documentSha256 !== selected.sha256) reject("INTEGRITY");
    const handle = Object.freeze({
      jobId: state.result.jobId,
      submissionSha256: state.result.submissionSha256,
      attempt: state.result.attempt,
      resultSha256: state.result.resultSha256,
      artifactId,
      artifactSha256: selected.sha256,
      revision,
    });
    acceptances.set(handle, handle);
    return handle;
  });
}
