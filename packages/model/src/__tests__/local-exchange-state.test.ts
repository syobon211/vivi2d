import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import projectFixture from "../../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import {
  createLocalSyncState,
  LOCAL_EXCHANGE_LIMITS,
  type LocalArtifact,
  type LocalJobCommand,
  type LocalJobState,
  type LocalResult,
  type LocalResultRequest,
  type LocalSubmissionRequest,
  type PreparedAcceptance,
  type PreparedJobResult,
  type PreparedRevision,
  type PreparedSubmission,
  prepareEmbeddedRevision,
  prepareJobAcceptance,
  prepareJobResult,
  prepareJobSubmission,
  publishLocalRevision,
  submitLocalJob,
  transitionLocalJob,
} from "../internal/local-exchange-state";
import { encodeUtf8 } from "../project-format-v11/portable-primitives";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const hashA = "a".repeat(64);
const documentId = "10000000-0000-4000-8000-000000000001";
function value<T>(result: LocalResult<T>): T {
  if (!result.ok) throw new Error(`Unexpected closed failure ${result.code}`);
  return result.value;
}
function attachment(id: string, bytes: Uint8Array): LocalArtifact {
  return {
    id,
    mediaType: "application/octet-stream",
    byteLength: bytes.length,
    sha256: sha256(bytes),
  };
}
function request(
  overrides: Partial<LocalSubmissionRequest> = {},
): LocalSubmissionRequest {
  const bytes = new Uint8Array([1, 2, 3]);
  return {
    scopeId: "scope",
    submissionKey: "submission",
    capabilityId: "generate.v1",
    capabilityVersion: "1.0",
    maxAttempts: 2,
    resultPolicy: { maxArtifacts: 4, maxBytes: 1024 },
    artifacts: [attachment("input", bytes)],
    blobs: [{ id: "input", bytes }],
    parametersUtf8: encodeUtf8('{"seed":1}'),
    ...overrides,
  };
}
async function submission(
  overrides: Partial<LocalSubmissionRequest> = {},
): Promise<PreparedSubmission> {
  return value(await prepareJobSubmission(request(overrides), sha256));
}
function claim(state: LocalJobState): LocalJobState {
  return value(
    transitionLocalJob(state, {
      kind: "claim",
      providerId: "provider",
      providerVersion: "1.0",
    }),
  );
}
function resultRequest(
  prepared: PreparedSubmission,
  attempt = 1,
  data = new Uint8Array([4]),
): LocalResultRequest {
  return {
    jobId: prepared.jobId,
    submissionSha256: prepared.submissionSha256,
    attempt,
    providerId: "provider",
    providerVersion: "1.0",
    capabilityId: prepared.capabilityId,
    capabilityVersion: prepared.capabilityVersion,
    artifacts: [attachment("output", data)],
    blobs: [{ id: "output", bytes: data }],
  };
}
async function result(
  prepared: PreparedSubmission,
  attempt = 1,
  data?: Uint8Array,
): Promise<PreparedJobResult> {
  return value(
    await prepareJobResult(prepared, resultRequest(prepared, attempt, data), sha256),
  );
}
function send(state: LocalJobState, command: LocalJobCommand): LocalJobState {
  return value(transitionLocalJob(state, command));
}

describe("local Job candidate preparation", () => {
  it("binds canonical parameters and sorted inputs; same key cannot replace a different request", async () => {
    const domainFixture = await submission();
    // Frozen domain-envelope vectors, independently derived from the selected literals.
    expect(domainFixture.jobId).toBe(
      "b7c68109945174a30d98b5dbc1c93f05b8643a945509457ad48f1ebf16879d8b",
    );
    expect(domainFixture.parametersSha256).toBe(
      "8830fc47ccf19793fd997195d8416d31834e272463c0f4d80263d4105977f0b6",
    );
    const a = new Uint8Array([1]),
      z = new Uint8Array([2]);
    const first = request({
      artifacts: [attachment("z", z), attachment("a", a)],
      blobs: [
        { id: "z", bytes: z },
        { id: "a", bytes: a },
      ],
      parametersUtf8: encodeUtf8('{"b":2,"a":1}'),
    });
    const second = request({
      artifacts: [...first.artifacts].reverse(),
      blobs: [...first.blobs].reverse(),
      parametersUtf8: encodeUtf8(' { "a": 1, "b": 2 } '),
    });
    const prepared = value(await prepareJobSubmission(first, sha256));
    const equivalent = value(await prepareJobSubmission(second, sha256));
    expect(equivalent).toEqual(prepared);
    const running = claim(value(submitLocalJob(null, prepared)));
    expect(value(submitLocalJob(running, equivalent))).toEqual(running);
    const changed = await submission({ parametersUtf8: encodeUtf8('{"seed":2}') });
    expect(changed.jobId).toBe(prepared.jobId);
    expect(submitLocalJob(running, changed)).toEqual({
      ok: false,
      code: "IDEMPOTENCY_MISMATCH",
    });
    expect(submitLocalJob(running, await submission({ scopeId: "other" }))).toEqual({
      ok: false,
      code: "BINDING",
    });
    expect(JSON.stringify(running)).not.toContain('"seed"');
  });

  it("rejects missing, extra, duplicate, wrong-sized and corrupted closure as a whole", async () => {
    const base = request();
    const extraBytes = new Uint8Array([8]);
    const cases: [Partial<LocalSubmissionRequest>, string][] = [
      [{ blobs: [] }, "INTEGRITY"],
      [{ blobs: [...base.blobs, { id: "extra", bytes: extraBytes }] }, "INTEGRITY"],
      [{ blobs: [...base.blobs, ...base.blobs] }, "BINDING"],
      [{ artifacts: [...base.artifacts, ...base.artifacts] }, "BINDING"],
      [{ blobs: [{ id: "input", bytes: new Uint8Array([1]) }] }, "INTEGRITY"],
      [{ blobs: [{ id: "input", bytes: new Uint8Array([3, 2, 1]) }] }, "INTEGRITY"],
      [{ artifacts: [{ ...base.artifacts[0], sha256: "A".repeat(64) }] }, "SHAPE"],
      [
        {
          artifacts: [
            { ...base.artifacts[0], mediaType: "application/json; charset=utf8" },
          ],
        },
        "SHAPE",
      ],
    ];
    for (const [change, code] of cases)
      expect(await prepareJobSubmission(request(change), sha256)).toEqual({
        ok: false,
        code,
      });
  });

  it("rejects forged prepared values, hidden unknown fields and accessor metadata without evaluating getters", async () => {
    const prepared = await submission();
    expect(submitLocalJob(null, { ...prepared })).toEqual({ ok: false, code: "BINDING" });
    expect(
      await prepareJobResult({ ...prepared }, resultRequest(prepared), sha256),
    ).toEqual({ ok: false, code: "BINDING" });
    let calls = 0;
    const withGetter = {
      ...request(),
      get scopeId() {
        calls++;
        return "scope";
      },
    };
    expect(await prepareJobSubmission(withGetter, sha256)).toEqual({
      ok: false,
      code: "SHAPE",
    });
    expect(calls).toBe(0);
    const extra = request();
    Object.defineProperty(extra, "path", {
      value: "synthetic-private-marker",
      enumerable: false,
    });
    expect(await prepareJobSubmission(extra, sha256)).toEqual({
      ok: false,
      code: "SHAPE",
    });
    const job = claim(value(submitLocalJob(null, prepared))),
      output = await result(prepared);
    expect(transitionLocalJob(job, { kind: "complete", result: { ...output } })).toEqual({
      ok: false,
      code: "BINDING",
    });
  });

  it("snapshots all descriptors, blobs and parameters before the first await; hash callback receives separate bytes", async () => {
    const one = new Uint8Array([1]),
      two = new Uint8Array([2]);
    const first = request({
      artifacts: [attachment("a", one), attachment("b", two)],
      blobs: [
        { id: "a", bytes: one },
        { id: "b", bytes: two },
      ],
    });
    const expected = value(await prepareJobSubmission(first, sha256));
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const pending = prepareJobSubmission(first, async (owned) => {
      const digest = sha256(owned);
      owned.fill(255);
      if (calls++ === 0) await blocked;
      return digest;
    });
    one.fill(7);
    two.fill(8);
    first.parametersUtf8.fill(32);
    (first as { scopeId: string }).scopeId = "changed";
    (first.artifacts[1] as { sha256: string }).sha256 = hashA;
    release?.();
    expect(value(await pending)).toEqual(expected);
    expect(calls).toBeGreaterThan(1);
  });

  it("uses closed errors for hostile callbacks and applies lowering-only count/byte/JSON limits", async () => {
    expect(
      await prepareJobSubmission(request(), () => {
        throw new Error("synthetic-private-marker");
      }),
    ).toEqual({ ok: false, code: "INTERNAL" });
    expect(await prepareJobSubmission(request(), () => "INVALID-SECRET")).toEqual({
      ok: false,
      code: "INTERNAL",
    });
    expect(await prepareJobSubmission(request(), sha256, { inputBytes: 2 })).toEqual({
      ok: false,
      code: "LIMIT",
    });
    expect(await prepareJobSubmission(request(), sha256, { attempts: 1 })).toEqual({
      ok: false,
      code: "LIMIT",
    });
    expect(
      await prepareJobSubmission(request(), sha256, {
        inputBytes: LOCAL_EXCHANGE_LIMITS.inputBytes + 1,
      }),
    ).toEqual({ ok: false, code: "LIMIT" });
    for (const invalid of ['{"x":1,"x":2}', '{"__proto__":1,"__proto__":2}', '{"url":']) {
      expect(
        await prepareJobSubmission(
          request({ parametersUtf8: encodeUtf8(invalid) }),
          sha256,
        ),
      ).toEqual({ ok: false, code: "SHAPE" });
    }
    expect(
      await prepareJobSubmission(
        request({ parametersUtf8: encodeUtf8("[[[0]]]") }),
        sha256,
        { parameterDepth: 2 },
      ),
    ).toEqual({ ok: false, code: "LIMIT" });
    expect(
      await prepareJobSubmission(
        request({ parametersUtf8: encodeUtf8("[0,1,2]") }),
        sha256,
        { parameterNodes: 3 },
      ),
    ).toEqual({ ok: false, code: "LIMIT" });
  });

  it("prepares only results bound to their submission and within its selected result budget", async () => {
    const prepared = await submission({ resultPolicy: { maxArtifacts: 1, maxBytes: 2 } });
    const base = resultRequest(prepared);
    expect(await prepareJobResult(prepared, { ...base, jobId: hashA }, sha256)).toEqual({
      ok: false,
      code: "BINDING",
    });
    expect(
      await prepareJobResult(prepared, { ...base, capabilityVersion: "2.0" }, sha256),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(
      await prepareJobResult(
        prepared,
        resultRequest(prepared, 1, new Uint8Array([1, 2, 3])),
        sha256,
      ),
    ).toEqual({ ok: false, code: "LIMIT" });
    const empty = await submission({ artifacts: [], blobs: [] });
    expect(
      value(
        await prepareJobResult(
          empty,
          { ...resultRequest(empty), artifacts: [], blobs: [] },
          sha256,
        ),
      ).artifacts,
    ).toEqual([]);
  });
});

describe("local Job finite transitions", () => {
  it("fences stale expiry by renewal without invalidating completion from the same attempt", async () => {
    const prepared = await submission(),
      first = claim(value(submitLocalJob(null, prepared)));
    expect(first).toMatchObject({
      stateVersion: 1,
      attempt: 1,
      phase: "running",
      active: { renewal: 0 },
    });
    expect(
      transitionLocalJob(first, {
        kind: "claim",
        providerId: "provider",
        providerVersion: "1.0",
      }),
    ).toEqual({ ok: false, code: "STATE" });
    const renewed = send(first, { kind: "heartbeat", attempt: 1, renewal: 0 });
    expect(
      transitionLocalJob(renewed, { kind: "heartbeat", attempt: 1, renewal: 0 }),
    ).toEqual({ ok: false, code: "STALE" });
    expect(
      transitionLocalJob(renewed, { kind: "expire", attempt: 1, renewal: 0 }),
    ).toEqual({ ok: false, code: "STALE" });
    const succeeded = send(renewed, { kind: "complete", result: await result(prepared) });
    expect(succeeded).toMatchObject({
      phase: "succeeded",
      stateVersion: 3,
      active: null,
      decision: { kind: "undecided" },
    });
    expect(first.active?.renewal).toBe(0);
  });

  it("never reuses attempts; exhausted and permanent failures cannot restart", async () => {
    const prepared = await submission(),
      first = claim(value(submitLocalJob(null, prepared)));
    const expired = send(first, { kind: "expire", attempt: 1, renewal: 0 });
    expect(
      transitionLocalJob(expired, { kind: "complete", result: await result(prepared) }),
    ).toEqual({ ok: false, code: "STALE" });
    const next = claim(send(expired, { kind: "retry" }));
    expect(next.attempt).toBe(2);
    expect(
      transitionLocalJob(next, { kind: "complete", result: await result(prepared, 1) }),
    ).toEqual({ ok: false, code: "STALE" });
    const exhausted = send(next, {
      kind: "failAttempt",
      attempt: 2,
      reason: "retryable",
    });
    expect(exhausted).toMatchObject({
      phase: "failed",
      failure: "exhausted",
      active: null,
    });
    expect(transitionLocalJob(exhausted, { kind: "retry" })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    const permanent = send(first, {
      kind: "failAttempt",
      attempt: 1,
      reason: "permanent",
    });
    expect(permanent.failure).toBe("permanent");
    expect(transitionLocalJob(permanent, { kind: "retry" })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    const retryable = send(first, {
      kind: "failAttempt",
      attempt: 1,
      reason: "retryable",
    });
    expect(retryable.phase).toBe("retryable");
  });

  it("cancel/complete and expire/complete choose only the first serialized terminal winner", async () => {
    const prepared = await submission(),
      first = claim(value(submitLocalJob(null, prepared))),
      output = await result(prepared);
    const cancelled = send(first, { kind: "cancel" });
    expect(cancelled.active).toBeNull();
    expect(transitionLocalJob(cancelled, { kind: "complete", result: output })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    const succeeded = send(first, { kind: "complete", result: output });
    expect(transitionLocalJob(succeeded, { kind: "cancel" })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    expect(
      transitionLocalJob(succeeded, { kind: "expire", attempt: 1, renewal: 0 }),
    ).toEqual({ ok: false, code: "TERMINAL" });
    expect(
      transitionLocalJob(succeeded, {
        kind: "complete",
        result: await result(prepared, 1, new Uint8Array([5])),
      }),
    ).toEqual({ ok: false, code: "TERMINAL" });
  });

  it("completion and submission replay preserve the current decision, including at the counter maximum", async () => {
    const prepared = await submission(),
      output = await result(prepared);
    const succeeded = send(claim(value(submitLocalJob(null, prepared))), {
      kind: "complete",
      result: output,
    });
    const rejected = send(succeeded, { kind: "reject" });
    const atLimit = { ...rejected, stateVersion: Number.MAX_SAFE_INTEGER };
    expect(send(atLimit, { kind: "complete", result: output })).toEqual(atLimit);
    expect(send(atLimit, { kind: "reject" })).toEqual(atLimit);
    expect(value(submitLocalJob(atLimit, prepared))).toEqual(atLimit);
    const changed = await result(prepared, 1, new Uint8Array([5]));
    expect(transitionLocalJob(atLimit, { kind: "complete", result: changed })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    expect(atLimit.decision.kind).toBe("rejected");
  });

  it("rejects overflow atomically, wrong provider, malformed state and forged acceptance", async () => {
    const prepared = await submission(),
      first = claim(value(submitLocalJob(null, prepared)));
    expect(
      transitionLocalJob(
        { ...first, stateVersion: Number.MAX_SAFE_INTEGER },
        { kind: "cancel" },
      ),
    ).toEqual({ ok: false, code: "LIMIT" });
    expect(
      transitionLocalJob(
        { ...first, active: { ...first.active!, renewal: Number.MAX_SAFE_INTEGER } },
        { kind: "heartbeat", attempt: 1, renewal: Number.MAX_SAFE_INTEGER },
      ),
    ).toEqual({ ok: false, code: "LIMIT" });
    const wrongProvider = value(
      await prepareJobResult(
        prepared,
        { ...resultRequest(prepared), providerId: "other" },
        sha256,
      ),
    );
    expect(
      transitionLocalJob(first, { kind: "complete", result: wrongProvider }),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(transitionLocalJob({ ...first, active: null }, { kind: "cancel" })).toEqual({
      ok: false,
      code: "SHAPE",
    });
    expect(
      transitionLocalJob(first, { kind: "accept", acceptance: {} as PreparedAcceptance }),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(first.stateVersion).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("reprepares retained bytes after metadata reload rather than treating serialized handles as authority", async () => {
    const prepared = await submission(),
      running = claim(value(submitLocalJob(null, prepared)));
    const restored = JSON.parse(JSON.stringify(running)) as LocalJobState;
    const restoredHandle = JSON.parse(JSON.stringify(prepared)) as PreparedSubmission;
    expect(submitLocalJob(restored, restoredHandle)).toEqual({
      ok: false,
      code: "BINDING",
    });
    const reverified = await submission();
    expect(value(submitLocalJob(restored, reverified))).toEqual(running);
    const output = await result(reverified);
    expect(send(restored, { kind: "complete", result: output }).phase).toBe("succeeded");
    expect(restored.phase).toBe("running");
  });
});

describe("Project boundary remains an actual owning validator", () => {
  const ports = { sha256, verifyPng: async (): Promise<"malformed"> => "malformed" };
  it("rejects non-Project bytes through the actual validator and rejects fabricated revisions", async () => {
    expect(createLocalSyncState("scope", "file:///synthetic-private-marker")).toEqual({
      ok: false,
      code: "SHAPE",
    });
    expect(
      await prepareEmbeddedRevision(
        {
          scopeId: "scope",
          documentId,
          parentRevisionId: null,
          documentUtf8: encodeUtf8("{}"),
        },
        ports,
      ),
    ).toEqual({ ok: false, code: "PROJECT" });
    const state = value(createLocalSyncState("scope", documentId));
    expect(
      publishLocalRevision(state, {
        scopeId: "scope",
        documentId,
        mutationId: "m1",
        expectedHead: state.head,
        revision: {
          scopeId: "scope",
          documentId,
          parentRevisionId: null,
          documentSha256: hashA,
          revisionId: hashA,
        } as PreparedRevision,
      }),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(state.head.version).toBe(0);
  });

  it("cannot accept unrelated supplied bytes or an unselected result artifact as a Project", async () => {
    const prepared = await submission(),
      output = await result(prepared, 1, encodeUtf8("{}"));
    const succeeded = send(claim(value(submitLocalJob(null, prepared))), {
      kind: "complete",
      result: output,
    });
    const command = {
      artifactId: "output",
      scopeId: "scope",
      documentId,
      parentRevisionId: null,
    };
    expect(await prepareJobAcceptance(succeeded, output, command, ports)).toEqual({
      ok: false,
      code: "PROJECT",
    });
    expect(
      await prepareJobAcceptance(
        succeeded,
        output,
        { ...command, artifactId: "absent" },
        ports,
      ),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(await prepareJobAcceptance(succeeded, { ...output }, command, ports)).toEqual({
      ok: false,
      code: "BINDING",
    });
    const arbitrary = { ...command, documentUtf8: encodeUtf8("{}") };
    expect(await prepareJobAcceptance(succeeded, output, arbitrary, ports)).toEqual({
      ok: false,
      code: "SHAPE",
    });
  });
});

describe("Project-backed Sync and explicit result acceptance", () => {
  const document = projectFixture.documents.find((entry) => entry.id === "core-v11");
  if (!document) throw new Error("Missing public Project conformance document");
  const docId = document.documentId;
  const canonical = encodeUtf8(document.canonicalUtf8);
  // Recorded native fixture evidence, NOT a TS-to-native execution bridge. Unknown
  // bytes or dimensions are rejected; the actual Project validator still executes.
  const recordedPorts = {
    sha256,
    verifyPng: async (
      bytes: Uint8Array,
      width: number,
      height: number,
    ): Promise<"ok" | "malformed"> => {
      const fixture = projectFixture.pngCases.find(
        (entry) =>
          entry.sha256 === sha256(bytes) &&
          entry.width === width &&
          entry.height === height &&
          Buffer.from(bytes).toString("base64") === entry.base64,
      );
      return fixture?.native.status === "ok" ? "ok" : "malformed";
    },
  };
  async function revision(parentRevisionId: string | null): Promise<PreparedRevision> {
    return value(
      await prepareEmbeddedRevision(
        {
          scopeId: "scope",
          documentId: docId,
          parentRevisionId,
          documentUtf8: canonical,
        },
        recordedPorts,
      ),
    );
  }
  const publish = (
    state: ReturnType<typeof initial>,
    mutationId: string,
    prepared: PreparedRevision,
    expectedHead = state.head,
  ) =>
    publishLocalRevision(state, {
      scopeId: "scope",
      documentId: docId,
      mutationId,
      expectedHead,
      revision: prepared,
    });
  function initial() {
    return value(createLocalSyncState("scope", docId));
  }

  it("runs actual Project validation, enforces canonical bytes and exact document identity", async () => {
    expect(sha256(canonical)).toBe(document.canonicalSha256);
    const prepared = await revision(null);
    expect(prepared.documentSha256).toBe(document.canonicalSha256);
    expect(
      await prepareEmbeddedRevision(
        {
          scopeId: "scope",
          documentId: docId,
          parentRevisionId: null,
          documentUtf8: encodeUtf8(document.inputUtf8),
        },
        recordedPorts,
      ),
    ).toEqual({ ok: false, code: "PROJECT" });
    expect(
      await prepareEmbeddedRevision(
        { scopeId: "scope", documentId, parentRevisionId: null, documentUtf8: canonical },
        recordedPorts,
      ),
    ).toEqual({ ok: false, code: "PROJECT" });
    expect(
      await prepareEmbeddedRevision(
        {
          scopeId: "scope",
          documentId: docId,
          parentRevisionId: null,
          documentUtf8: canonical,
        },
        {
          ...recordedPorts,
          verifyPng: async () => {
            throw new Error("synthetic-private-marker");
          },
        },
      ),
    ).toEqual({ ok: false, code: "PROJECT" });
  });

  it("replays original publish/conflict receipts without restoring an old head, including offline re-preparation", async () => {
    const empty = initial(),
      firstRevision = await revision(null);
    const first = value(publish(empty, "first", firstRevision));
    expect(first.state.head).toEqual({
      revisionId: firstRevision.revisionId,
      version: 1,
    });
    const conflict = value(publish(first.state, "offline", firstRevision, empty.head));
    expect(conflict.receipt).toMatchObject({
      outcome: "conflict",
      observedHead: first.state.head,
    });
    const secondRevision = await revision(firstRevision.revisionId);
    expect(secondRevision.revisionId).not.toBe(firstRevision.revisionId);
    const later = value(publish(conflict.state, "second", secondRevision));
    const reloaded = JSON.parse(JSON.stringify(later.state));
    const reverified = await revision(null);
    const replay = value(publish(reloaded, "offline", reverified, empty.head));
    expect(replay.receipt).toEqual(conflict.receipt);
    expect(replay.state.head).toEqual(later.state.head);
    expect(replay.state.receipts).toHaveLength(3);
    expect(value(publish(replay.state, "first", reverified, empty.head)).receipt).toEqual(
      first.receipt,
    );
    expect(
      publish(later.state, "first", await revision(later.state.head.revisionId)),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_MISMATCH" });
    expect(publish(later.state, "bad-parent", firstRevision)).toEqual({
      ok: false,
      code: "BINDING",
    });
    expect(
      value(publish(JSON.parse(JSON.stringify(empty)), "first", reverified)).state,
    ).toEqual(first.state);
  });

  it("keeps receipt history at capacity and rejects publication overflow without blocking exact replay or conflict", async () => {
    const empty = initial(),
      firstRevision = await revision(null);
    const first = value(publish(empty, "first", firstRevision));
    const nextRevision = await revision(firstRevision.revisionId);
    const command = {
      scopeId: "scope",
      documentId: docId,
      mutationId: "second",
      expectedHead: first.state.head,
      revision: nextRevision,
    };
    expect(publishLocalRevision(first.state, command, { receipts: 1 })).toEqual({
      ok: false,
      code: "LIMIT",
    });
    expect(
      value(
        publishLocalRevision(
          first.state,
          {
            ...command,
            mutationId: "first",
            expectedHead: empty.head,
            revision: firstRevision,
          },
          { receipts: 1 },
        ),
      ).receipt,
    ).toEqual(first.receipt);
    const maximum = {
      ...first.state,
      head: { ...first.state.head, version: Number.MAX_SAFE_INTEGER },
    };
    expect(publish(maximum, "second", nextRevision)).toEqual({
      ok: false,
      code: "LIMIT",
    });
    const conflict = value(publish(maximum, "stale", firstRevision, empty.head));
    expect(conflict.state.head).toEqual(maximum.head);
    expect(conflict.receipt.outcome).toBe("conflict");
    expect(
      value(publish(maximum, "first", firstRevision, empty.head)).state.head,
    ).toEqual(maximum.head);
  });

  it("retains exact result bytes across Buffer mutation and accepts only the winning artifact, leaving Sync separate", async () => {
    const prepared = await submission({
      resultPolicy: { maxArtifacts: 2, maxBytes: 16 * 1024 },
    });
    const running = claim(value(submitLocalJob(null, prepared)));
    const callerBytes = Buffer.from(canonical);
    const input = resultRequest(prepared, 1, callerBytes);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const pending = prepareJobResult(prepared, input, async (bytes) => {
      const actual = sha256(bytes);
      bytes.fill(0);
      if (calls++ === 0) await blocked;
      return actual;
    });
    callerBytes.fill(0);
    (input as { providerId: string }).providerId = "changed";
    release?.();
    const output = value(await pending),
      succeeded = send(running, { kind: "complete", result: output });
    const command = {
      artifactId: "output",
      scopeId: "scope",
      documentId: docId,
      parentRevisionId: null,
    };
    const acceptance = value(
      await prepareJobAcceptance(succeeded, output, command, recordedPorts),
    );
    const differentOutput = await result(
      prepared,
      1,
      encodeUtf8(`${document.canonicalUtf8} `),
    );
    expect(
      await prepareJobAcceptance(succeeded, differentOutput, command, recordedPorts),
    ).toEqual({ ok: false, code: "BINDING" });
    expect(acceptance.artifactSha256).toBe(document.canonicalSha256);
    const accepted = send(succeeded, { kind: "accept", acceptance });
    expect(accepted.decision).toMatchObject({
      kind: "accepted",
      acceptance: {
        artifactId: "output",
        revision: { revisionId: acceptance.revision.revisionId },
      },
    });
    const atMaximum = { ...accepted, stateVersion: Number.MAX_SAFE_INTEGER };
    expect(send(atMaximum, { kind: "accept", acceptance })).toEqual(atMaximum);
    expect(send(atMaximum, { kind: "complete", result: output })).toEqual(atMaximum);
    expect(transitionLocalJob(accepted, { kind: "reject" })).toEqual({
      ok: false,
      code: "TERMINAL",
    });
    const otherCandidate = value(
      await prepareJobAcceptance(
        succeeded,
        output,
        { ...command, parentRevisionId: hashA },
        recordedPorts,
      ),
    );
    expect(
      transitionLocalJob(accepted, { kind: "accept", acceptance: otherCandidate }),
    ).toEqual({ ok: false, code: "TERMINAL" });
    expect(
      transitionLocalJob(send(succeeded, { kind: "reject" }), {
        kind: "accept",
        acceptance,
      }),
    ).toEqual({ ok: false, code: "TERMINAL" });
    const empty = initial();
    expect(empty.head.version).toBe(0);
    const intervening = value(publish(empty, "unrelated", await revision(null)));
    const conflict = value(
      publish(intervening.state, "accepted-result", acceptance.revision, empty.head),
    );
    expect(conflict.receipt.outcome).toBe("conflict");
    expect(conflict.state.head).toEqual(intervening.state.head);
    expect(accepted.phase).toBe("succeeded");
  });
});
