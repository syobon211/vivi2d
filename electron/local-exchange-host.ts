import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import {
  createLocalSyncState,
  decodeRawBase64,
  decodeUtf8Fatal,
  type EmbeddedRoundTripPorts,
  type LocalArtifact,
  type LocalBlob,
  type LocalHead,
  type LocalJobState,
  type LocalReceipt,
  type LocalResult,
  type LocalSyncState,
  type PreparedJobResult,
  type PreparedRevision,
  type PreparedSubmission,
  prepareEmbeddedRevision,
  prepareJobResult,
  prepareJobSubmission,
  publishLocalRevision,
  restoreLocalJobState,
  restoreLocalSyncState,
  submitLocalJob,
  transitionLocalJob,
} from "@vivi2d/model/internal/local-exchange";
import {
  assertAtlasImageAllocationWithinLimits,
  MAX_VIVI_TEXT_FILE_BYTES,
} from "@vivi2d/model/load-limits";
import { parseViviFile } from "@vivi2d/model/project-parser";
import { assertPublicRawViviFileProfile } from "@vivi2d/model/public-profile";
import { COMFYUI_PROVIDER_MANIFEST } from "@vivi2d/provider-comfyui";
import type { ViviProviderResult } from "@vivi2d/provider-sdk";
import { createNativePngDecoder } from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";
import { writeFileAtomically } from "./atomic-write.cjs";
import {
  type AdapterWrapper,
  type ComfySubmission,
  type OwnedInputs,
  type ResultManifest,
  counter,
  exact,
  ExchangeFault,
  freezeResult,
  freezeSubmission,
  hashId,
  id,
  insist,
  jsonBytes,
  ownBytes,
  readJson,
  same,
  sdkRequest,
  sha,
  validateResultSelection,
} from "./local-exchange-provider";

export const LOCAL_HOST_LIMITS = Object.freeze({
  cellBytes: 1048576,
  manifestBytes: 262144,
  cells: 128,
  objects: 4096,
  objectBytes: 2 * 1024 * 1024 * 1024,
  pending: 16,
  revisions: 256,
  outbox: 64,
});
type HostLimits = { -readonly [K in keyof typeof LOCAL_HOST_LIMITS]: number };
interface ObjectRef {
  sha256: string;
  byteLength: number;
}
interface RevisionRef extends PreparedRevision {
  byteLength: number;
}
interface Outbox {
  targetCellId: string;
  mutationId: string;
  expectedHead: LocalHead;
  revisionId: string;
  receipt: LocalReceipt | null;
}
interface JobOutbox extends Outbox {
  observedRevision: RevisionRef | null;
}
interface BaseCell {
  format: 1;
  kind: "sync" | "job";
  scopeId: string;
  replicaId: string;
  cellId: string;
  commitVersion: number;
}
export interface SyncCell extends BaseCell {
  kind: "sync";
  documentId: string;
  state: LocalSyncState;
  revisions: RevisionRef[];
  outbox: Outbox[];
}
interface Candidate extends ObjectRef {
  documentId: string;
  conversionVersion: "vivi2d.local-import.v1";
  revision: PreparedRevision | null;
}
interface Selection {
  decisionId: string;
  kind: "rejected" | "import-approved" | "project-approved";
  attempt: number;
  resultSha256: string;
  manifestSha256: string;
  selectedIds: string[];
  candidate: Candidate | null;
}
export interface JobCell extends BaseCell {
  kind: "job";
  state: LocalJobState;
  submission: { parameters: ObjectRef; artifacts: LocalArtifact[] };
  sdkResult: { manifestSha256: string; byteLength: number } | null;
  selection: Selection | null;
  outbox: JobOutbox | null;
}
export type ExchangeCell = SyncCell | JobCell;
export interface HostOptions {
  root: string;
  ownsProcessLock: boolean;
  now?: () => number;
  limits?: Partial<HostLimits>;
  /** Private test seam around the real complete-file writer; never renderer input. */
  writeAtomic?: typeof writeFileAtomically;
  onAbort?: (sessionId: string, cellId: string, attempt: number) => void;
}
interface Lease {
  cellId: string;
  sessionId: string;
  attempt: number;
  started: number;
  timer: ReturnType<typeof setTimeout> | null;
}
const openRoots = new Set<string>();
const DOCUMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function value<T>(result: LocalResult<T>): T {
  if (!result.ok) throw new ExchangeFault(result.code);
  return result.value;
}
function clone<T>(input: T): T {
  return readJson(
    jsonBytes(input, LOCAL_HOST_LIMITS.cellBytes),
    LOCAL_HOST_LIMITS.cellBytes,
  ) as T;
}
function cellIdentity(
  kind: string,
  scopeId: string,
  replicaId: string,
  key: string,
): string {
  return sha(jsonBytes(["vivi2d.local.cell.v1", kind, scopeId, replicaId, key], 4096));
}
function objectRef(bytes: Uint8Array): ObjectRef {
  return { sha256: sha(bytes), byteLength: bytes.length };
}

/** One process-lock owner, one bounded writer queue; no background provider resume. */
export class LocalExchangeHost {
  private readonly root: string;
  private readonly limits: HostLimits;
  private readonly cells = new Map<string, ExchangeCell>();
  private readonly frozen = new Set<string>();
  private readonly objects = new Map<string, number>();
  private readonly submissions = new Map<string, PreparedSubmission>();
  private readonly results = new Map<string, PreparedJobResult>();
  private readonly inputs = new Map<string, OwnedInputs>();
  private rootIdentity = "";
  private objectDirectoryIdentity = "";
  private cellDirectoryIdentity = "";
  private temporaryObjectBytes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closed = false;
  private lease: Lease | null = null;
  private readonly now: () => number;
  private readonly writeAtomic: typeof writeFileAtomically;
  private readonly onAbort: NonNullable<HostOptions["onAbort"]>;

  private constructor(options: HostOptions) {
    insist(options.ownsProcessLock === true, "OWNER");
    this.root = path.resolve(options.root);
    const key = process.platform === "win32" ? this.root.toLowerCase() : this.root;
    insist(!openRoots.has(key), "OWNER");
    this.limits = { ...LOCAL_HOST_LIMITS };
    for (const [name, limit] of Object.entries(options.limits ?? {})) {
      insist(Object.hasOwn(this.limits, name), "SHAPE");
      const property = name as keyof HostLimits;
      insist(counter(limit, this.limits[property]) > 0, "LIMIT");
      this.limits[property] = limit;
    }
    this.now = options.now ?? (() => performance.now());
    this.writeAtomic = options.writeAtomic ?? writeFileAtomically;
    this.onAbort = options.onAbort ?? (() => {});
    openRoots.add(key);
  }

  static async open(options: HostOptions): Promise<LocalExchangeHost> {
    const host = new LocalExchangeHost(options);
    try {
      await host.restore();
      return host;
    } catch {
      host.close();
      throw new ExchangeFault("INTEGRITY");
    }
  }

  close(): void {
    if (this.closed) return;
    if (this.lease?.timer) clearTimeout(this.lease.timer);
    this.lease = null;
    this.closed = true;
    openRoots.delete(process.platform === "win32" ? this.root.toLowerCase() : this.root);
  }

  list(): { cells: ExchangeCell[]; frozenCellIds: string[] } {
    this.assertRoot();
    for (const cell of this.cells.values()) {
      try {
        this.current(cell.cellId);
      } catch {
        this.frozen.add(cell.cellId);
      }
    }
    return {
      cells: [...this.cells.values()]
        .filter((cell) => !this.frozen.has(cell.cellId))
        .map(clone),
      frozenCellIds: [...this.frozen],
    };
  }

  query(cellId: string): ExchangeCell {
    return clone(this.current(cellId));
  }

  async createWorkspace(documentId: string): Promise<SyncCell> {
    insist(DOCUMENT_ID.test(documentId), "SHAPE");
    const scopeId = randomUUID(),
      replicaId = randomUUID();
    return this.command(() =>
      this.serial(() => {
        const cell: SyncCell = {
          format: 1,
          kind: "sync",
          scopeId,
          replicaId,
          cellId: cellIdentity("sync", scopeId, replicaId, documentId),
          commitVersion: 0,
          documentId,
          state: value(createLocalSyncState(scopeId, documentId)),
          revisions: [],
          outbox: [],
        };
        this.commit(cell, null);
        return clone(cell);
      }),
    );
  }

  async createReplica(sourceCellId: string): Promise<SyncCell> {
    const source = this.sync(sourceCellId);
    const replicaId = randomUUID();
    return this.command(() =>
      this.serial(() => {
        const cell: SyncCell = {
          format: 1,
          kind: "sync",
          scopeId: source.scopeId,
          replicaId,
          cellId: cellIdentity("sync", source.scopeId, replicaId, source.documentId),
          commitVersion: 0,
          documentId: source.documentId,
          state: value(createLocalSyncState(source.scopeId, source.documentId)),
          revisions: [],
          outbox: [],
        };
        this.commit(cell, null);
        return clone(cell);
      }),
    );
  }

  /** Main-to-main local replica import; not a renderer-selected filesystem path. */
  async createMatchingReplica(
    source: Pick<SyncCell, "scopeId" | "documentId">,
  ): Promise<SyncCell> {
    const scopeId = id(source.scopeId),
      documentId = source.documentId;
    insist(DOCUMENT_ID.test(documentId), "SHAPE");
    return this.command(() =>
      this.serial(() => {
        const replicaId = randomUUID();
        const cell: SyncCell = {
          format: 1,
          kind: "sync",
          scopeId,
          replicaId,
          documentId,
          cellId: cellIdentity("sync", scopeId, replicaId, documentId),
          commitVersion: 0,
          state: value(createLocalSyncState(scopeId, documentId)),
          revisions: [],
          outbox: [],
        };
        this.commit(cell, null);
        return clone(cell);
      }),
    );
  }

  async publish(
    cellId: string,
    mutationId: string,
    expectedHead: LocalHead,
    documentUtf8: Uint8Array,
  ): Promise<LocalReceipt> {
    const bytes = ownBytes(documentUtf8, MAX_VIVI_TEXT_FILE_BYTES),
      expected = clone(expectedHead),
      mutation = id(mutationId);
    const initial = this.sync(cellId);
    return this.command(async () => {
      const revision = await this.prepareRevision(
        initial.scopeId,
        initial.documentId,
        expected.revisionId,
        bytes,
      );
      const objects = this.prepareObjects([bytes]);
      return this.serial(() => {
        const cell = this.sync(cellId);
        const next = value(
          publishLocalRevision(cell.state, {
            scopeId: cell.scopeId,
            documentId: cell.documentId,
            mutationId: mutation,
            expectedHead: expected,
            revision,
          }),
        );
        if (same(next.state, cell.state)) return clone(next.receipt);
        const refs = this.addRevision(cell.revisions, revision, bytes.length);
        this.writeObjects(objects);
        this.commit(
          {
            ...cell,
            state: next.state,
            revisions: refs,
            commitVersion: counter(cell.commitVersion + 1),
          },
          cell.commitVersion,
        );
        return clone(next.receipt);
      });
    });
  }

  async queuePublication(
    sourceCellId: string,
    target: Pick<SyncCell, "cellId" | "scopeId" | "documentId" | "state">,
    mutationId: string,
    documentUtf8: Uint8Array,
  ): Promise<Outbox> {
    const bytes = ownBytes(documentUtf8, MAX_VIVI_TEXT_FILE_BYTES),
      receiver = clone(target),
      mutation = id(mutationId);
    const source = this.sync(sourceCellId);
    insist(
      source.scopeId === receiver.scopeId && source.documentId === receiver.documentId,
      "BINDING",
    );
    hashId(receiver.cellId);
    return this.command(async () => {
      const revision = await this.prepareRevision(
        source.scopeId,
        source.documentId,
        receiver.state.head.revisionId,
        bytes,
      );
      const intent: Outbox = {
        targetCellId: receiver.cellId,
        mutationId: mutation,
        expectedHead: receiver.state.head,
        revisionId: revision.revisionId,
        receipt: null,
      };
      const objects = this.prepareObjects([bytes]);
      return this.serial(() => {
        const cell = this.sync(sourceCellId);
        const previous = cell.outbox.find((item) => item.mutationId === mutation);
        if (previous) {
          insist(same({ ...previous, receipt: null }, intent), "IDEMPOTENCY_MISMATCH");
          return clone(previous);
        }
        insist(cell.outbox.length < this.limits.outbox, "LIMIT");
        const revisions = this.addRevision(cell.revisions, revision, bytes.length);
        this.writeObjects(objects);
        this.commit(
          {
            ...cell,
            revisions,
            outbox: [...cell.outbox, intent],
            commitVersion: counter(cell.commitVersion + 1),
          },
          cell.commitVersion,
        );
        return clone(intent);
      });
    });
  }

  async deliver(
    sourceCellId: string,
    mutationId: string,
    receiver: LocalExchangeHost = this,
  ): Promise<LocalReceipt> {
    return this.command(() => this.deliverOnce(sourceCellId, mutationId, receiver));
  }
  private async deliverOnce(
    sourceCellId: string,
    mutationId: string,
    receiver: LocalExchangeHost,
  ): Promise<LocalReceipt> {
    const source = this.sync(sourceCellId);
    const intent = source.outbox.find((item) => item.mutationId === id(mutationId));
    insist(intent, "BINDING");
    if (intent.receipt) return clone(intent.receipt);
    const revision = source.revisions.find(
      (item) => item.revisionId === intent.revisionId,
    );
    insist(revision, "INTEGRITY");
    const bytes = this.readObject({
      sha256: revision.documentSha256,
      byteLength: revision.byteLength,
    });
    const target = receiver.sync(intent.targetCellId);
    insist(
      source.scopeId === target.scopeId && source.documentId === target.documentId,
      "BINDING",
    );
    const receipt = await receiver.publish(
      target.cellId,
      intent.mutationId,
      intent.expectedHead,
      bytes,
    );
    const observed =
      receipt.observedHead.revisionId === null
        ? null
        : receiver.revisionBytes(target.cellId, receipt.observedHead.revisionId);
    const observedPrepared = observed
      ? await this.prepareRevision(
          source.scopeId,
          source.documentId,
          observed.revision.parentRevisionId,
          observed.bytes,
        )
      : null;
    if (observed && observedPrepared)
      insist(same(observedPrepared, this.withoutLength(observed.revision)), "INTEGRITY");
    const objects = this.prepareObjects(observed ? [observed.bytes] : []);
    return this.serial(() => {
      const cell = this.sync(sourceCellId);
      const currentIntent = cell.outbox.find((item) => item.mutationId === mutationId);
      insist(currentIntent && same({ ...currentIntent, receipt: null }, intent), "STALE");
      if (currentIntent.receipt) {
        insist(same(currentIntent.receipt, receipt), "INTEGRITY");
        return clone(receipt);
      }
      const refs =
        observedPrepared && observed
          ? this.addRevision(cell.revisions, observedPrepared, observed.bytes.length)
          : cell.revisions;
      this.writeObjects(objects);
      this.commit(
        {
          ...cell,
          revisions: refs,
          outbox: cell.outbox.map((item) =>
            item === currentIntent ? { ...item, receipt } : item,
          ),
          commitVersion: counter(cell.commitVersion + 1),
        },
        cell.commitVersion,
      );
      return clone(receipt);
    });
  }

  revisionBytes(
    cellId: string,
    revisionId: string,
  ): { revision: RevisionRef; bytes: Uint8Array } {
    const revision = this.sync(cellId).revisions.find(
      (item) => item.revisionId === hashId(revisionId),
    );
    insist(revision, "BINDING");
    return {
      revision: clone(revision),
      bytes: this.readObject({
        sha256: revision.documentSha256,
        byteLength: revision.byteLength,
      }),
    };
  }

  async submit(
    workspaceId: string,
    submissionKey: string,
    request: ComfySubmission,
    maxAttempts: number,
    resultPolicy: { maxArtifacts: number; maxBytes: number },
  ): Promise<JobCell> {
    const input = freezeSubmission(request),
      key = id(submissionKey),
      attempts = counter(maxAttempts, 8),
      policy = clone(resultPolicy);
    const workspace = this.sync(workspaceId);
    const parameters = jsonBytes(input.wrapper, 65536);
    return this.command(async () => {
      const prepared = value(
        await prepareJobSubmission(
          {
            scopeId: workspace.scopeId,
            submissionKey: key,
            capabilityId: request.capabilityId,
            capabilityVersion: request.capabilityVersion,
            maxAttempts: attempts,
            resultPolicy: policy,
            artifacts: input.artifacts,
            blobs: input.blobs,
            parametersUtf8: parameters,
          },
          sha,
        ),
      );
      sdkRequest(prepared.jobId, 1, input, prepared.resultPolicy, prepared.capabilityId);
      const objects = this.prepareObjects([
        parameters,
        ...input.blobs.map((item) => item.bytes),
      ]);
      return this.serial(() => {
        const cellId = cellIdentity(
          "job",
          workspace.scopeId,
          workspace.replicaId,
          prepared.jobId,
        );
        const previous = this.cells.has(cellId) ? this.job(cellId) : null;
        const state = value(submitLocalJob(previous?.state ?? null, prepared));
        if (previous) return clone(previous);
        const cell: JobCell = {
          format: 1,
          kind: "job",
          scopeId: workspace.scopeId,
          replicaId: workspace.replicaId,
          cellId,
          commitVersion: 0,
          state,
          submission: { parameters: objectRef(parameters), artifacts: input.artifacts },
          sdkResult: null,
          selection: null,
          outbox: null,
        };
        this.writeObjects(objects);
        this.commit(cell, null);
        this.inputs.set(cellId, input);
        this.submissions.set(cellId, prepared);
        return clone(cell);
      });
    });
  }

  async start(
    cellId: string,
    expectedStateVersion: number,
    sessionId: string,
  ): Promise<{
    cell: JobCell;
    sessionId: string;
    attempt: number;
    endpoint: string;
    request: ReturnType<typeof sdkRequest>;
  }> {
    const session = id(sessionId),
      expected = counter(expectedStateVersion);
    const original = this.job(cellId);
    this.readObject(original.submission.parameters);
    for (const artifact of original.submission.artifacts) this.readObject(artifact);
    return this.command(() =>
      this.serial(() => {
        const cell = this.job(cellId);
        insist(cell.state.stateVersion === expected, "STALE");
        insist(cell.selection === null, "TERMINAL");
        insist(this.lease === null, "BUSY");
        let state = cell.state;
        if (state.phase === "retryable")
          state = value(transitionLocalJob(state, { kind: "retry" }));
        state = value(
          transitionLocalJob(state, {
            kind: "claim",
            providerId: COMFYUI_PROVIDER_MANIFEST.id,
            providerVersion: COMFYUI_PROVIDER_MANIFEST.version,
          }),
        );
        const input = this.inputs.get(cellId);
        insist(input, "INTEGRITY");
        const request = sdkRequest(
          state.submission.jobId,
          state.attempt,
          input,
          state.submission.resultPolicy,
          state.submission.capabilityId,
        );
        const next = { ...cell, state, commitVersion: counter(cell.commitVersion + 1) };
        this.commit(next, cell.commitVersion);
        const started = this.now();
        insist(Number.isFinite(started) && started >= 0, "INTERNAL");
        this.lease = {
          cellId,
          sessionId: session,
          attempt: state.attempt,
          started,
          timer: null,
        };
        this.armTimer(this.lease);
        return {
          cell: clone(next),
          sessionId: session,
          attempt: state.attempt,
          endpoint: input.wrapper.endpoint,
          request,
        };
      }),
    );
  }

  async cancel(
    cellId: string,
    expectedStateVersion: number,
    attempt: number,
  ): Promise<JobCell> {
    counter(expectedStateVersion);
    counter(attempt, 8);
    return this.command(() =>
      this.serial(() => {
        const cell = this.job(cellId);
        insist(
          cell.state.stateVersion === expectedStateVersion &&
            cell.state.attempt === attempt,
          "STALE",
        );
        insist(cell.selection === null, "TERMINAL");
        const state = value(transitionLocalJob(cell.state, { kind: "cancel" }));
        const next = { ...cell, state, commitVersion: counter(cell.commitVersion + 1) };
        this.commit(next, cell.commitVersion);
        this.abortLease(cellId);
        return clone(next);
      }),
    );
  }

  async failAttempt(
    cellId: string,
    attempt: number,
    sessionId: string,
    reason: "retryable" | "permanent",
  ): Promise<JobCell> {
    return this.command(() =>
      this.serial(() => {
        this.matchLease(cellId, attempt, sessionId);
        const cell = this.job(cellId);
        const state = value(
          transitionLocalJob(cell.state, { kind: "failAttempt", attempt, reason }),
        );
        const next = { ...cell, state, commitVersion: counter(cell.commitVersion + 1) };
        this.commit(next, cell.commitVersion);
        return clone(next);
      }),
    );
  }

  /** A cancelled/expired invocation continues occupying its slot until this settles. */
  async settled(cellId: string, attempt: number, sessionId: string): Promise<void> {
    await this.serial(() => {
      this.matchLease(cellId, attempt, sessionId);
      const lease = this.lease!;
      // A promise with no accepted completion/failure is not a durable running job.
      try {
        this.expireIfRunning(lease);
      } finally {
        if (this.lease === lease) {
          if (lease.timer) clearTimeout(lease.timer);
          this.lease = null;
        }
      }
    });
  }

  async rendererLost(sessionId: string): Promise<void> {
    if (!this.lease || this.lease.sessionId !== sessionId) return;
    const lease = this.lease;
    await this.serial(() => {
      if (this.lease !== lease) return;
      try {
        this.expireIfRunning(lease);
      } finally {
        if (this.lease === lease) {
          if (lease.timer) clearTimeout(lease.timer);
          this.lease = null;
        }
      }
    });
  }

  progress(cellId: string, attempt: number, sessionId: string): boolean {
    try {
      this.matchLease(cellId, attempt, sessionId);
      return (
        this.job(cellId).state.phase === "running" && this.elapsed(this.lease!) < 120000
      );
    } catch {
      return false;
    }
  }

  async complete(
    cellId: string,
    attempt: number,
    sessionId: string,
    raw: ViviProviderResult,
  ): Promise<JobCell> {
    const initial = this.job(cellId),
      input = this.inputs.get(cellId),
      submission = this.submissions.get(cellId);
    insist(input && submission, "INTEGRITY");
    const request = sdkRequest(
      submission.jobId,
      attempt,
      input,
      submission.resultPolicy,
      submission.capabilityId,
    );
    let owned: ReturnType<typeof freezeResult>;
    let manifestBytes: Uint8Array;
    try {
      owned = freezeResult(
        submission.jobId,
        attempt,
        submission.capabilityVersion,
        request,
        raw,
      );
      manifestBytes = jsonBytes(owned.manifest, this.limits.manifestBytes);
    } catch {
      await this.failAttempt(cellId, attempt, sessionId, "permanent").catch(() => {});
      throw new ExchangeFault("RESULT");
    }
    const manifestRef = {
      manifestSha256: sha(manifestBytes),
      byteLength: manifestBytes.length,
    };
    const objects = this.prepareObjects([
      ...owned.blobs.map((item) => item.bytes),
      manifestBytes,
    ]);
    return this.command(async () => {
      const preparation = await prepareJobResult(
        submission,
        {
          jobId: submission.jobId,
          submissionSha256: submission.submissionSha256,
          attempt,
          providerId: owned.manifest.providerId,
          providerVersion: owned.manifest.providerVersion,
          capabilityId: submission.capabilityId,
          capabilityVersion: submission.capabilityVersion,
          artifacts: owned.manifest.artifacts.map(
            ({ id, mediaType, byteLength, sha256 }) => ({
              id,
              mediaType,
              byteLength,
              sha256,
            }),
          ),
          blobs: owned.blobs,
        },
        sha,
      );
      if (!preparation.ok) {
        await this.failAttempt(cellId, attempt, sessionId, "permanent").catch(() => {});
        throw new ExchangeFault("RESULT");
      }
      const result = preparation.value;
      return this.serial(() => {
        const cell = this.job(cellId);
        // Committed equality precedes new-completion deadline/session checks.
        if (cell.state.phase === "succeeded") {
          insist(
            same(cell.state.result, result) && same(cell.sdkResult, manifestRef),
            "IDEMPOTENCY_MISMATCH",
          );
          return clone(cell);
        }
        this.matchLease(cellId, attempt, sessionId);
        insist(
          cell.commitVersion === initial.commitVersion &&
            cell.state.phase === "running" &&
            cell.state.attempt === attempt,
          "STALE",
        );
        this.writeObjects(objects);
        // Storage and validation time count. The timer need not have fired.
        if (this.elapsed(this.lease!) >= 120000) {
          this.expireIfRunning(this.lease!);
          throw new ExchangeFault("EXPIRED");
        }
        const state = value(transitionLocalJob(cell.state, { kind: "complete", result }));
        const next = {
          ...cell,
          state,
          sdkResult: manifestRef,
          commitVersion: counter(cell.commitVersion + 1),
        };
        this.commit(next, cell.commitVersion);
        this.results.set(cellId, result);
        return clone(next);
      });
    });
  }

  proposal(
    cellId: string,
    selectedIds: readonly string[],
  ): { manifest: ResultManifest; blobs: LocalBlob[] } {
    const cell = this.job(cellId);
    insist(cell.state.phase === "succeeded" && cell.sdkResult, "STATE");
    const manifest = this.readManifest(cell);
    const blobs = manifest.artifacts.map((artifact) => ({
      id: artifact.id,
      bytes: this.readObject(artifact),
    }));
    validateResultSelection(manifest, [...selectedIds], blobs);
    return {
      manifest: clone(manifest),
      blobs: blobs.filter((item) => selectedIds.includes(item.id)),
    };
  }

  resultManifest(cellId: string): ResultManifest {
    return clone(this.readManifest(this.job(cellId)));
  }

  async reject(cellId: string, decisionId: string): Promise<JobCell> {
    const decision = id(decisionId);
    return this.command(() =>
      this.serial(() => {
        const cell = this.job(cellId);
        insist(cell.state.result && cell.sdkResult, "STATE");
        const selection: Selection = {
          decisionId: decision,
          kind: "rejected",
          attempt: cell.state.attempt,
          resultSha256: cell.state.result.resultSha256,
          manifestSha256: cell.sdkResult.manifestSha256,
          selectedIds: [],
          candidate: null,
        };
        if (cell.selection) {
          insist(same(cell.selection, selection), "TERMINAL");
          return clone(cell);
        }
        const state = value(transitionLocalJob(cell.state, { kind: "reject" }));
        const next = {
          ...cell,
          state,
          selection,
          commitVersion: counter(cell.commitVersion + 1),
        };
        this.commit(next, cell.commitVersion);
        return clone(next);
      }),
    );
  }

  async approve(
    cellId: string,
    decisionId: string,
    selectedIds: readonly string[],
    kind: "import-approved" | "project-approved",
    documentId: string,
    candidateBytes: Uint8Array,
    target?: { cellId: string; mutationId: string; expectedHead: LocalHead },
  ): Promise<JobCell> {
    const bytes = ownBytes(candidateBytes, MAX_VIVI_TEXT_FILE_BYTES),
      selected = [...selectedIds].map(id).sort(),
      decision = id(decisionId),
      destination = target ? clone(target) : undefined;
    insist(DOCUMENT_ID.test(documentId), "SHAPE");
    const initial = this.job(cellId);
    insist(initial.state.result && initial.sdkResult, "STATE");
    this.proposal(cellId, selected);
    insist(kind === "import-approved" || kind === "project-approved", "SHAPE");
    insist(kind === "project-approved" || destination === undefined, "UNSUPPORTED");
    return this.command(async () => {
      const revision =
        kind === "project-approved"
          ? await this.prepareRevision(
              initial.scopeId,
              documentId,
              destination?.expectedHead.revisionId ?? null,
              bytes,
            )
          : null;
      if (kind === "import-approved") await this.validateLegacy(bytes);
      const objects = this.prepareObjects([bytes]);
      const candidate: Candidate = {
        ...objectRef(bytes),
        documentId,
        conversionVersion: "vivi2d.local-import.v1",
        revision,
      };
      const selection: Selection = {
        decisionId: decision,
        kind,
        attempt: initial.state.attempt,
        resultSha256: initial.state.result!.resultSha256,
        manifestSha256: initial.sdkResult!.manifestSha256,
        selectedIds: selected,
        candidate,
      };
      const intent: JobOutbox | null =
        destination && revision
          ? {
              targetCellId: hashId(destination.cellId),
              mutationId: id(destination.mutationId),
              expectedHead: destination.expectedHead,
              revisionId: revision.revisionId,
              receipt: null,
              observedRevision: null,
            }
          : null;
      if (intent) {
        const receiver = this.sync(intent.targetCellId);
        insist(
          receiver.scopeId === initial.scopeId && receiver.documentId === documentId,
          "BINDING",
        );
      }
      return this.serial(() => {
        const cell = this.job(cellId);
        if (cell.selection) {
          insist(
            same(cell.selection, selection) &&
              same(
                cell.outbox
                  ? { ...cell.outbox, receipt: null, observedRevision: null }
                  : null,
                intent,
              ),
            "TERMINAL",
          );
          return clone(cell);
        }
        insist(
          cell.commitVersion === initial.commitVersion &&
            cell.state.decision.kind === "undecided",
          "STALE",
        );
        this.writeObjects(objects);
        const next = {
          ...cell,
          selection,
          outbox: intent,
          commitVersion: counter(cell.commitVersion + 1),
        };
        this.commit(next, cell.commitVersion);
        return clone(next);
      });
    });
  }

  approvedCandidate(cellId: string): { selection: Selection; bytes: Uint8Array } {
    const cell = this.job(cellId);
    insist(cell.selection?.candidate && cell.selection.kind !== "rejected", "STATE");
    return {
      selection: clone(cell.selection),
      bytes: this.readObject(cell.selection.candidate),
    };
  }

  async deliverApproved(
    cellId: string,
    receiver: LocalExchangeHost = this,
  ): Promise<LocalReceipt> {
    return this.command(() => this.deliverApprovedOnce(cellId, receiver));
  }
  private async deliverApprovedOnce(
    cellId: string,
    receiver: LocalExchangeHost,
  ): Promise<LocalReceipt> {
    const initial = this.job(cellId),
      intent = initial.outbox,
      candidate = initial.selection?.candidate;
    insist(intent && candidate?.revision, "STATE");
    if (intent.receipt) return clone(intent.receipt);
    const target = receiver.sync(intent.targetCellId);
    insist(
      target.scopeId === initial.scopeId && target.documentId === candidate.documentId,
      "BINDING",
    );
    const receipt = await receiver.publish(
      target.cellId,
      intent.mutationId,
      intent.expectedHead,
      this.readObject(candidate),
    );
    const observed =
      receipt.observedHead.revisionId === null
        ? null
        : receiver.revisionBytes(target.cellId, receipt.observedHead.revisionId);
    if (observed) {
      const prepared = await this.prepareRevision(
        initial.scopeId,
        candidate.documentId,
        observed.revision.parentRevisionId,
        observed.bytes,
      );
      insist(same(prepared, this.withoutLength(observed.revision)), "INTEGRITY");
    }
    const objects = this.prepareObjects(observed ? [observed.bytes] : []);
    return this.serial(() => {
      const cell = this.job(cellId);
      insist(
        cell.outbox &&
          same({ ...cell.outbox, receipt: null, observedRevision: null }, intent),
        "STALE",
      );
      if (cell.outbox.receipt) {
        insist(same(cell.outbox.receipt, receipt), "INTEGRITY");
        return clone(receipt);
      }
      this.writeObjects(objects);
      this.commit(
        {
          ...cell,
          outbox: { ...intent, receipt, observedRevision: observed?.revision ?? null },
          commitVersion: counter(cell.commitVersion + 1),
        },
        cell.commitVersion,
      );
      return clone(receipt);
    });
  }

  private async restore(): Promise<void> {
    this.ensureDirectory(this.root);
    this.ensureDirectory(path.join(this.root, "objects"));
    this.ensureDirectory(path.join(this.root, "cells"));
    this.rootIdentity = this.directoryIdentity(this.root);
    this.objectDirectoryIdentity = this.directoryIdentity(
      path.join(this.root, "objects"),
    );
    this.cellDirectoryIdentity = this.directoryIdentity(path.join(this.root, "cells"));
    const rootEntries = this.inventory(this.root, 2);
    insist(
      rootEntries.length === 2 &&
        rootEntries.includes("objects") &&
        rootEntries.includes("cells"),
      "INTEGRITY",
    );
    this.scanObjects();
    const names = this.inventory(path.join(this.root, "cells"), this.limits.cells + 16);
    insist(names.length <= this.limits.cells + 16, "LIMIT");
    for (const name of names) {
      if (/^\.vivi2d-[a-f0-9]{32}\.tmp$/.test(name)) {
        insist(
          this.assertRegular(path.join(this.root, "cells", name)).size <=
            this.limits.cellBytes,
          "LIMIT",
        );
        continue;
      }
      insist(/^[a-f0-9]{64}\.json$/.test(name), "INTEGRITY");
      const cellId = name.slice(0, -5);
      try {
        const bytes = this.readFile(
          path.join(this.root, "cells", name),
          this.limits.cellBytes,
        );
        const raw = readJson(bytes, this.limits.cellBytes);
        insist(
          Buffer.from(jsonBytes(raw, this.limits.cellBytes)).equals(Buffer.from(bytes)),
          "INTEGRITY",
        );
        const cell = this.checkCell(raw);
        insist(cell.cellId === cellId, "INTEGRITY");
        this.cells.set(cellId, cell);
        await this.verifyCellObjects(cell);
        if (cell.kind === "job" && cell.state.phase === "running") {
          const state = value(
            transitionLocalJob(cell.state, {
              kind: "expire",
              attempt: cell.state.attempt,
              renewal: cell.state.active!.renewal,
            }),
          );
          this.commit(
            { ...cell, state, commitVersion: counter(cell.commitVersion + 1) },
            cell.commitVersion,
          );
        }
      } catch {
        this.frozen.add(cellId);
      }
    }
    insist(
      this.cells.size + [...this.frozen].filter((key) => !this.cells.has(key)).length <=
        this.limits.cells,
      "LIMIT",
    );
  }

  private async verifyCellObjects(cell: ExchangeCell): Promise<void> {
    if (cell.kind === "sync") {
      for (const ref of cell.revisions) {
        const bytes = this.readObject({
          sha256: ref.documentSha256,
          byteLength: ref.byteLength,
        });
        const prepared = await this.prepareRevision(
          ref.scopeId,
          ref.documentId,
          ref.parentRevisionId,
          bytes,
        );
        insist(same(prepared, this.withoutLength(ref)), "INTEGRITY");
      }
      const required = [
        cell.state.head.revisionId,
        ...cell.state.receipts.flatMap((receipt) => [
          receipt.revisionId,
          receipt.observedHead.revisionId,
        ]),
        ...cell.outbox.flatMap((item) => [
          item.revisionId,
          item.receipt?.observedHead.revisionId ?? null,
        ]),
      ];
      insist(
        required.every(
          (revision) =>
            revision === null ||
            cell.revisions.some((item) => item.revisionId === revision),
        ),
        "INTEGRITY",
      );
      return;
    }
    const wrapper = readJson(
      this.readObject(cell.submission.parameters),
      65536,
    ) as AdapterWrapper;
    exact(wrapper, [
      "adapterVersion",
      "providerId",
      "providerVersion",
      "endpoint",
      "providerParameters",
      "inputKinds",
    ]);
    insist(
      wrapper.adapterVersion === 1 &&
        wrapper.providerId === COMFYUI_PROVIDER_MANIFEST.id &&
        wrapper.providerVersion === COMFYUI_PROVIDER_MANIFEST.version &&
        Array.isArray(wrapper.inputKinds),
      "INTEGRITY",
    );
    const input = freezeSubmission({
      capabilityId: cell.state.submission.capabilityId,
      capabilityVersion: cell.state.submission.capabilityVersion,
      endpoint: wrapper.endpoint,
      providerParameters: wrapper.providerParameters,
      inputArtifacts: cell.submission.artifacts.map((artifact) => ({
        ...artifact,
        kind: wrapper.inputKinds.find((entry) => entry.id === artifact.id)!.kind,
        data: new Uint8Array(this.readObject(artifact)).buffer,
      })),
    });
    insist(same(wrapper, input.wrapper), "INTEGRITY");
    const prepared = value(
      await prepareJobSubmission(
        {
          scopeId: cell.scopeId,
          submissionKey: cell.state.submission.submissionKey,
          capabilityId: cell.state.submission.capabilityId,
          capabilityVersion: cell.state.submission.capabilityVersion,
          maxAttempts: cell.state.submission.maxAttempts,
          resultPolicy: cell.state.submission.resultPolicy,
          artifacts: input.artifacts,
          blobs: input.blobs,
          parametersUtf8: this.readObject(cell.submission.parameters),
        },
        sha,
      ),
    );
    insist(same(prepared, cell.state.submission), "INTEGRITY");
    this.inputs.set(cell.cellId, input);
    this.submissions.set(cell.cellId, prepared);
    if (cell.sdkResult) {
      const manifest = this.readManifest(cell);
      const blobs = manifest.artifacts.map((artifact) => ({
        id: artifact.id,
        bytes: this.readObject(artifact),
      }));
      const request = sdkRequest(
        prepared.jobId,
        manifest.attempt,
        input,
        prepared.resultPolicy,
        prepared.capabilityId,
      );
      const rebuilt = freezeResult(
        prepared.jobId,
        manifest.attempt,
        prepared.capabilityVersion,
        request,
        {
          requestId: manifest.requestId,
          capabilityId: manifest.capabilityId,
          warnings: [],
          provenance: {
            providerId: manifest.providerId,
            providerVersion: manifest.providerVersion,
            capabilityId: manifest.capabilityId,
            generatedAt: "1970-01-01T00:00:00.000Z",
          },
          artifacts: manifest.artifacts.map((artifact) => ({
            ...artifact,
            data: new Uint8Array(blobs.find((item) => item.id === artifact.id)!.bytes)
              .buffer,
          })),
        },
      );
      insist(same(rebuilt.manifest, manifest), "INTEGRITY");
      const result = value(
        await prepareJobResult(
          prepared,
          {
            jobId: prepared.jobId,
            submissionSha256: prepared.submissionSha256,
            attempt: manifest.attempt,
            providerId: manifest.providerId,
            providerVersion: manifest.providerVersion,
            capabilityId: manifest.capabilityId,
            capabilityVersion: manifest.capabilityVersion,
            artifacts: manifest.artifacts.map(
              ({ id, mediaType, byteLength, sha256 }) => ({
                id,
                mediaType,
                byteLength,
                sha256,
              }),
            ),
            blobs,
          },
          sha,
        ),
      );
      insist(same(result, cell.state.result), "INTEGRITY");
      this.results.set(cell.cellId, result);
      if (cell.selection) {
        insist(
          cell.selection.attempt === result.attempt &&
            cell.selection.resultSha256 === result.resultSha256 &&
            cell.selection.manifestSha256 === cell.sdkResult.manifestSha256,
          "INTEGRITY",
        );
        if (cell.selection.kind !== "rejected")
          validateResultSelection(manifest, cell.selection.selectedIds, blobs);
      }
    }
    if (cell.selection?.candidate) {
      const candidate = cell.selection.candidate,
        bytes = this.readObject(candidate);
      if (cell.selection.kind === "import-approved") await this.validateLegacy(bytes);
      else {
        insist(candidate.revision, "INTEGRITY");
        const revision = await this.prepareRevision(
          cell.scopeId,
          candidate.documentId,
          candidate.revision.parentRevisionId,
          bytes,
        );
        insist(same(revision, candidate.revision), "INTEGRITY");
      }
    }
    if (cell.outbox?.observedRevision) {
      const ref = cell.outbox.observedRevision;
      const bytes = this.readObject({
        sha256: ref.documentSha256,
        byteLength: ref.byteLength,
      });
      const prepared = await this.prepareRevision(
        cell.scopeId,
        ref.documentId,
        ref.parentRevisionId,
        bytes,
      );
      insist(same(prepared, this.withoutLength(ref)), "INTEGRITY");
    }
  }

  private checkCell(input: unknown): ExchangeCell {
    insist(input !== null && typeof input === "object", "SHAPE");
    const kind = (input as BaseCell).kind;
    const base = [
      "format",
      "kind",
      "scopeId",
      "replicaId",
      "cellId",
      "commitVersion",
      "state",
    ];
    const raw = exact(input, [
      ...base,
      ...(kind === "sync"
        ? ["documentId", "revisions", "outbox"]
        : ["submission", "sdkResult", "selection", "outbox"]),
    ]);
    insist(raw.format === 1 && (kind === "sync" || kind === "job"), "SHAPE");
    id(raw.scopeId);
    id(raw.replicaId);
    hashId(raw.cellId);
    counter(raw.commitVersion);
    const cell = input as ExchangeCell;
    if (cell.kind === "sync") {
      value(restoreLocalSyncState(cell.state));
      insist(
        DOCUMENT_ID.test(cell.documentId) &&
          cell.state.scopeId === cell.scopeId &&
          cell.state.documentId === cell.documentId,
        "BINDING",
      );
      insist(
        Array.isArray(cell.revisions) &&
          cell.revisions.length <= this.limits.revisions &&
          new Set(cell.revisions.map((item) => item.revisionId)).size ===
            cell.revisions.length,
        "LIMIT",
      );
      for (const item of cell.revisions) {
        exact(item, [
          "scopeId",
          "documentId",
          "parentRevisionId",
          "documentSha256",
          "revisionId",
          "byteLength",
        ]);
        insist(
          item.scopeId === cell.scopeId && item.documentId === cell.documentId,
          "BINDING",
        );
        hashId(item.documentSha256);
        hashId(item.revisionId);
        if (item.parentRevisionId !== null) hashId(item.parentRevisionId);
        counter(item.byteLength, MAX_VIVI_TEXT_FILE_BYTES);
      }
      insist(
        Array.isArray(cell.outbox) &&
          cell.outbox.length <= this.limits.outbox &&
          new Set(cell.outbox.map((item) => item.mutationId)).size === cell.outbox.length,
        "LIMIT",
      );
      for (const item of cell.outbox) {
        this.checkOutbox(item, cell.scopeId, cell.documentId);
        const candidate = cell.revisions.find((ref) => ref.revisionId === item.revisionId);
        insist(candidate && candidate.parentRevisionId === item.expectedHead.revisionId, "BINDING");
      }
      insist(
        cell.cellId ===
          cellIdentity("sync", cell.scopeId, cell.replicaId, cell.documentId),
        "BINDING",
      );
    } else {
      value(restoreLocalJobState(cell.state));
      insist(
        cell.state.submission.scopeId === cell.scopeId &&
          cell.cellId ===
            cellIdentity(
              "job",
              cell.scopeId,
              cell.replicaId,
              cell.state.submission.jobId,
            ),
        "BINDING",
      );
      exact(cell.submission, ["parameters", "artifacts"]);
      this.checkObjectRef(cell.submission.parameters, 65536);
      insist(
        Array.isArray(cell.submission.artifacts) &&
          cell.submission.artifacts.length <= 128,
        "LIMIT",
      );
      for (const artifact of cell.submission.artifacts) {
        exact(artifact, ["id", "mediaType", "byteLength", "sha256"]);
        id(artifact.id);
        hashId(artifact.sha256);
        counter(artifact.byteLength, 50 * 1024 * 1024);
      }
      insist((cell.sdkResult !== null) === (cell.state.phase === "succeeded"), "BINDING");
      if (cell.sdkResult) {
        exact(cell.sdkResult, ["manifestSha256", "byteLength"]);
        hashId(cell.sdkResult.manifestSha256);
        counter(cell.sdkResult.byteLength, this.limits.manifestBytes);
      }
      if (cell.selection) {
        exact(cell.selection, [
          "decisionId",
          "kind",
          "attempt",
          "resultSha256",
          "manifestSha256",
          "selectedIds",
          "candidate",
        ]);
        const selection = cell.selection;
        id(selection.decisionId);
        counter(selection.attempt, 8);
        hashId(selection.resultSha256);
        hashId(selection.manifestSha256);
        insist(
          ["rejected", "import-approved", "project-approved"].includes(selection.kind) &&
            cell.state.phase === "succeeded",
          "BINDING",
        );
        insist(
          Array.isArray(selection.selectedIds) &&
            selection.selectedIds.length <= 128 &&
            new Set(selection.selectedIds).size === selection.selectedIds.length,
          "BINDING",
        );
        selection.selectedIds.forEach(id);
        insist(
          (selection.kind === "rejected") === (selection.candidate === null),
          "BINDING",
        );
        insist(
          (selection.kind === "rejected") === (cell.state.decision.kind === "rejected"),
          "BINDING",
        );
        // This closed Comfy adapter produces conversions, never a Project result
        // artifact. Metadata cannot claim the pure prepared-acceptance proof.
        if (selection.kind !== "rejected")
          insist(cell.state.decision.kind === "undecided", "UNSUPPORTED");
        if (selection.candidate) {
          const candidate = selection.candidate;
          exact(candidate, [
            "sha256",
            "byteLength",
            "documentId",
            "conversionVersion",
            "revision",
          ]);
          hashId(candidate.sha256);
          counter(candidate.byteLength, MAX_VIVI_TEXT_FILE_BYTES);
          insist(
            DOCUMENT_ID.test(candidate.documentId) &&
              candidate.conversionVersion === "vivi2d.local-import.v1",
            "BINDING",
          );
          insist(
            (selection.kind === "project-approved") === (candidate.revision !== null),
            "BINDING",
          );
        } else insist(selection.selectedIds.length === 0, "BINDING");
      } else insist(cell.state.decision.kind === "undecided", "BINDING");
      if (cell.outbox) {
        insist(
          cell.selection?.kind === "project-approved" &&
            cell.selection.candidate?.revision,
          "BINDING",
        );
        exact(cell.outbox, [
          "targetCellId",
          "mutationId",
          "expectedHead",
          "revisionId",
          "receipt",
          "observedRevision",
        ]);
        const { observedRevision, ...intent } = cell.outbox;
        this.checkOutbox(intent, cell.scopeId, cell.selection.candidate.documentId);
        insist(
          intent.revisionId === cell.selection.candidate.revision.revisionId &&
            intent.expectedHead.revisionId ===
              cell.selection.candidate.revision.parentRevisionId,
          "BINDING",
        );
        insist(
          (observedRevision?.revisionId ?? null) ===
            (intent.receipt?.observedHead.revisionId ?? null),
          "BINDING",
        );
        if (observedRevision) {
          exact(observedRevision, [
            "scopeId",
            "documentId",
            "parentRevisionId",
            "documentSha256",
            "revisionId",
            "byteLength",
          ]);
          insist(
            observedRevision.scopeId === cell.scopeId &&
              observedRevision.documentId === cell.selection.candidate.documentId,
            "BINDING",
          );
          hashId(observedRevision.revisionId);
          hashId(observedRevision.documentSha256);
          counter(observedRevision.byteLength, MAX_VIVI_TEXT_FILE_BYTES);
        }
      }
    }
    jsonBytes(cell, this.limits.cellBytes);
    return cell;
  }

  private checkOutbox(input: Outbox, scopeId: string, documentId: string): void {
    exact(input, ["targetCellId", "mutationId", "expectedHead", "revisionId", "receipt"]);
    hashId(input.targetCellId);
    id(input.mutationId);
    hashId(input.revisionId);
    value(
      restoreLocalSyncState({
        scopeId,
        documentId,
        head: input.expectedHead,
        receipts: [],
      }),
    );
    if (input.receipt) {
      value(
        restoreLocalSyncState({
          scopeId,
          documentId,
          head: input.receipt.observedHead,
          receipts: [input.receipt],
        }),
      );
      insist(
        input.receipt.mutationId === input.mutationId &&
          input.receipt.revisionId === input.revisionId &&
          same(input.receipt.expectedHead, input.expectedHead),
        "BINDING",
      );
    }
  }
  private checkObjectRef(input: ObjectRef, limit: number): void {
    exact(input, ["sha256", "byteLength"]);
    hashId(input.sha256);
    counter(input.byteLength, limit);
  }
  private readManifest(cell: JobCell): ResultManifest {
    insist(cell.sdkResult, "STATE");
    const manifest = readJson(
      this.readObject({
        sha256: cell.sdkResult.manifestSha256,
        byteLength: cell.sdkResult.byteLength,
      }),
      this.limits.manifestBytes,
    ) as ResultManifest;
    exact(manifest, [
      "format",
      "jobId",
      "attempt",
      "requestId",
      "providerId",
      "providerVersion",
      "capabilityId",
      "capabilityVersion",
      "artifacts",
    ]);
    insist(manifest.format === 1 && Array.isArray(manifest.artifacts), "INTEGRITY");
    return manifest;
  }
  private current(cellId: string): ExchangeCell {
    this.assertRoot();
    hashId(cellId);
    insist(!this.frozen.has(cellId), "INTEGRITY");
    const cell = this.cells.get(cellId);
    insist(cell, "MISSING");
    try {
      const bytes = this.readFile(
        path.join(this.root, "cells", `${cellId}.json`),
        this.limits.cellBytes,
      );
      insist(
        Buffer.from(jsonBytes(cell, this.limits.cellBytes)).equals(Buffer.from(bytes)),
        "INTEGRITY",
      );
    } catch {
      this.frozen.add(cellId);
      throw new ExchangeFault("INTEGRITY");
    }
    return cell;
  }
  private sync(cellId: string): SyncCell {
    const cell = this.current(cellId);
    insist(cell.kind === "sync", "BINDING");
    return cell;
  }
  private job(cellId: string): JobCell {
    const cell = this.current(cellId);
    insist(cell.kind === "job", "BINDING");
    return cell;
  }
  private commit(cell: ExchangeCell, previousVersion: number | null): void {
    this.assertRoot();
    this.checkCell(cell);
    if (previousVersion === null)
      insist(
        !this.cells.has(cell.cellId) &&
          !this.frozen.has(cell.cellId) &&
          new Set([...this.cells.keys(), ...this.frozen]).size < this.limits.cells,
        "LIMIT",
      );
    else
      insist(
        this.current(cell.cellId).commitVersion === previousVersion &&
          cell.commitVersion === previousVersion + 1,
        "STALE",
      );
    const bytes = jsonBytes(cell, this.limits.cellBytes);
    try {
      this.writeAtomic(path.join(this.root, "cells", `${cell.cellId}.json`), bytes);
    } catch {
      this.frozen.add(cell.cellId);
      throw new ExchangeFault("IO");
    }
    this.cells.set(cell.cellId, clone(cell));
  }
  private readObject(ref: ObjectRef): Uint8Array {
    try {
      this.assertRoot();
      hashId(ref.sha256);
      counter(ref.byteLength, 200 * 1024 * 1024);
      const bytes = this.readFile(
        path.join(this.root, "objects", `${ref.sha256}.bin`),
        ref.byteLength,
      );
      insist(bytes.length === ref.byteLength && sha(bytes) === ref.sha256, "INTEGRITY");
      return bytes;
    } catch {
      for (const cell of this.cells.values()) {
        const referenced =
          cell.kind === "sync"
            ? cell.revisions.some((revision) => revision.documentSha256 === ref.sha256)
            : cell.submission.parameters.sha256 === ref.sha256 ||
              cell.submission.artifacts.some(
                (artifact) => artifact.sha256 === ref.sha256,
              ) ||
              cell.sdkResult?.manifestSha256 === ref.sha256 ||
              cell.state.result?.artifacts.some(
                (artifact) => artifact.sha256 === ref.sha256,
              ) ||
              cell.selection?.candidate?.sha256 === ref.sha256 ||
              cell.outbox?.observedRevision?.documentSha256 === ref.sha256;
        if (referenced) this.frozen.add(cell.cellId);
      }
      throw new ExchangeFault("INTEGRITY");
    }
  }
  private prepareObjects(inputs: readonly Uint8Array[]): ReadonlyMap<string, Uint8Array> {
    const candidates = new Map<string, Uint8Array>();
    for (const bytes of inputs) {
      insist(bytes.length <= 200 * 1024 * 1024, "LIMIT");
      const hash = sha(bytes);
      const previous = candidates.get(hash);
      if (previous) insist(Buffer.from(previous).equals(Buffer.from(bytes)), "INTEGRITY");
      else candidates.set(hash, bytes);
    }
    return candidates;
  }
  private writeObjects(candidates: ReadonlyMap<string, Uint8Array>): void {
    this.assertRoot();
    // New candidate hashing was outside the writer queue. Existing-object recheck
    // stays inside the owner queue, as required by the immutable-object contract.
    this.scanObjects();
    let count = this.objects.size,
      total =
        this.temporaryObjectBytes +
        [...this.objects.values()].reduce((sum, size) => sum + size, 0);
    for (const [hash, bytes] of candidates) {
      if (this.objects.has(hash))
        insist(
          Buffer.from(this.readObject({ sha256: hash, byteLength: bytes.length })).equals(
            Buffer.from(bytes),
          ),
          "INTEGRITY",
        );
      else {
        count++;
        total += bytes.length;
      }
    }
    insist(count <= this.limits.objects && total <= this.limits.objectBytes, "LIMIT");
    try {
      for (const [hash, bytes] of candidates)
        if (!this.objects.has(hash)) {
          this.writeAtomic(path.join(this.root, "objects", `${hash}.bin`), bytes);
          this.objects.set(hash, bytes.length);
        }
    } catch {
      this.scanObjects();
      throw new ExchangeFault("IO");
    }
  }
  private scanObjects(): void {
    this.objects.clear();
    this.temporaryObjectBytes = 0;
    const names = this.inventory(
      path.join(this.root, "objects"),
      this.limits.objects + 16,
    );
    let total = 0;
    for (const name of names) {
      const file = path.join(this.root, "objects", name),
        stat = this.assertRegular(file);
      total += stat.size;
      insist(total <= this.limits.objectBytes, "LIMIT");
      if (/^\.vivi2d-[a-f0-9]{32}\.tmp$/.test(name)) {
        this.temporaryObjectBytes += stat.size;
        continue;
      }
      insist(
        /^[a-f0-9]{64}\.bin$/.test(name) && stat.size <= 200 * 1024 * 1024,
        "INTEGRITY",
      );
      this.objects.set(name.slice(0, -4), stat.size);
    }
    insist(this.objects.size <= this.limits.objects, "LIMIT");
  }
  private readFile(file: string, limit: number): Uint8Array {
    const stat = this.assertRegular(file);
    insist(stat.size <= limit, "LIMIT");
    const fd = fs.openSync(file, "r");
    try {
      const opened = fs.fstatSync(fd);
      insist(
        opened.isFile() &&
          opened.ino === stat.ino &&
          opened.dev === stat.dev &&
          opened.size === stat.size,
        "INTEGRITY",
      );
      const bytes = new Uint8Array(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
        insist(read > 0, "INTEGRITY");
        offset += read;
      }
      insist(
        fs.readSync(fd, new Uint8Array(1), 0, 1, null) === 0 &&
          fs.fstatSync(fd).size === stat.size,
        "INTEGRITY",
      );
      return bytes;
    } finally {
      fs.closeSync(fd);
    }
  }
  private assertRegular(file: string): fs.Stats {
    const stat = fs.lstatSync(file);
    insist(stat.isFile() && !stat.isSymbolicLink(), "INTEGRITY");
    return stat;
  }
  private inventory(directory: string, maximum: number): string[] {
    const handle = fs.opendirSync(directory),
      names: string[] = [];
    try {
      for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
        insist(names.length < maximum, "LIMIT");
        names.push(entry.name);
      }
    } finally {
      handle.closeSync();
    }
    return names;
  }
  private directoryIdentity(directory: string): string {
    const stat = fs.lstatSync(directory);
    insist(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        path.resolve(fs.realpathSync(directory)).toLowerCase() ===
          path.resolve(directory).toLowerCase(),
      "INTEGRITY",
    );
    return `${stat.dev}:${stat.ino}`;
  }
  private ensureDirectory(directory: string): void {
    const parent = path.dirname(directory);
    if (parent !== directory) {
      try {
        this.directoryIdentity(parent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          this.ensureDirectory(parent);
        else throw error;
      }
    }
    try {
      this.directoryIdentity(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fs.mkdirSync(directory, { mode: 0o700 });
    }
  }
  private assertRoot(): void {
    insist(!this.closed, "CLOSED");
    insist(this.directoryIdentity(this.root) === this.rootIdentity, "INTEGRITY");
    insist(
      this.directoryIdentity(path.join(this.root, "objects")) ===
        this.objectDirectoryIdentity &&
        this.directoryIdentity(path.join(this.root, "cells")) ===
          this.cellDirectoryIdentity,
      "INTEGRITY",
    );
  }
  private async command<T>(run: () => Promise<T>): Promise<T> {
    insist(!this.closed && this.pending < this.limits.pending, "BUSY");
    this.pending++;
    try {
      return await run();
    } catch (error) {
      if (error instanceof ExchangeFault) throw error;
      throw new ExchangeFault("INTERNAL");
    } finally {
      this.pending--;
    }
  }
  private serial<T>(run: () => T | Promise<T>): Promise<T> {
    const operation = this.tail.then(() => {
      insist(!this.closed, "CLOSED");
      return run();
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  private matchLease(cellId: string, attempt: number, sessionId: string): void {
    insist(
      this.lease &&
        this.lease.cellId === cellId &&
        this.lease.attempt === attempt &&
        this.lease.sessionId === sessionId,
      "STALE",
    );
  }
  private elapsed(lease: Lease): number {
    const now = this.now();
    insist(Number.isFinite(now) && now >= lease.started, "INTERNAL");
    return now - lease.started;
  }
  private armTimer(lease: Lease): void {
    lease.timer = setTimeout(
      () => {
        void this.serial(() => {
          if (this.lease !== lease) return;
          if (this.elapsed(lease) >= 120000) this.expireIfRunning(lease);
          else this.armTimer(lease);
        }).catch(() => {});
      },
      Math.max(1, 120000 - this.elapsed(lease)),
    );
    lease.timer.unref?.();
  }
  private expireIfRunning(lease: Lease): void {
    const cell = this.job(lease.cellId);
    if (cell.state.phase !== "running" || cell.state.attempt !== lease.attempt) return;
    const state = value(
      transitionLocalJob(cell.state, {
        kind: "expire",
        attempt: lease.attempt,
        renewal: cell.state.active!.renewal,
      }),
    );
    this.commit(
      { ...cell, state, commitVersion: counter(cell.commitVersion + 1) },
      cell.commitVersion,
    );
    this.abortLease(cell.cellId);
  }
  private abortLease(cellId: string): void {
    if (this.lease?.cellId === cellId) {
      if (this.lease.timer) clearTimeout(this.lease.timer);
      this.onAbort(this.lease.sessionId, cellId, this.lease.attempt);
    }
  }
  private addRevision(
    refs: RevisionRef[],
    revision: PreparedRevision,
    byteLength: number,
  ): RevisionRef[] {
    const next = { ...revision, byteLength },
      existing = refs.find((item) => item.revisionId === revision.revisionId);
    if (existing) {
      insist(same(existing, next), "INTEGRITY");
      return refs;
    }
    insist(refs.length < this.limits.revisions, "LIMIT");
    return [...refs, next];
  }
  private withoutLength(ref: RevisionRef): PreparedRevision {
    const { byteLength: _, ...revision } = ref;
    return revision;
  }
  private async withProjectPorts<T>(
    action: (ports: EmbeddedRoundTripPorts) => Promise<T>,
  ): Promise<T> {
    const created = await createNativePngDecoder();
    insist(created.ok, "UNAVAILABLE");
    try {
      return await action({
        sha256: sha,
        verifyPng: async (bytes, width, height) => {
          const result = created.decoder.decode({
            bytes,
            expectedSha256: new Uint8Array(Buffer.from(sha(bytes), "hex")),
            width,
            height,
          });
          if (result.ok) return "ok";
          insist(
            result.kind === "png" && result.status >= 2 && result.status <= 5,
            "INTERNAL",
          );
          return (
            { 2: "unsupported", 3: "malformed", 4: "limit", 5: "dimension" } as const
          )[result.status as 2 | 3 | 4 | 5];
        },
      });
    } finally {
      created.decoder.dispose();
    }
  }
  private async prepareRevision(
    scopeId: string,
    documentId: string,
    parentRevisionId: string | null,
    bytes: Uint8Array,
  ): Promise<PreparedRevision> {
    return this.withProjectPorts(async (ports) =>
      value(
        await prepareEmbeddedRevision(
          { scopeId, documentId, parentRevisionId, documentUtf8: bytes },
          ports,
        ),
      ),
    );
  }
  private async validateLegacy(bytes: Uint8Array): Promise<void> {
    const raw = readJson(bytes, MAX_VIVI_TEXT_FILE_BYTES);
    assertPublicRawViviFileProfile(raw);
    const parsed = parseViviFile(decodeUtf8Fatal(bytes), { profile: "publicProfileV1" });
    assertAtlasImageAllocationWithinLimits(parsed.atlases);
    await this.withProjectPorts(async (ports) => {
      for (const atlas of parsed.atlases) {
        const png = decodeRawBase64(atlas.image),
          view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        insist(
          png.length >= 24 &&
            (await ports.verifyPng(png, view.getUint32(16), view.getUint32(20))) === "ok",
          "PROJECT",
        );
      }
    });
  }
}
