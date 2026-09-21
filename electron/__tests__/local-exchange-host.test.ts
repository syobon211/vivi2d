// @vitest-environment node
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComfyUIClient,
  createComfyUIProvider,
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "@vivi2d/provider-comfyui";
import type { ComfyUITransport } from "@vivi2d/provider-comfyui/transport";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { parseViviFile } from "@vivi2d/model/project-parser";
import fixture from "../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { writeFileAtomically } from "../atomic-write.cjs";
import {
  LocalExchangeHost,
  type HostOptions,
  type JobCell,
  type SyncCell,
} from "../local-exchange-host";
import { jsonBytes, sha, type ComfySubmission } from "../local-exchange-provider";

const roots: string[] = [],
  hosts: LocalExchangeHost[] = [];
const document = fixture.documents[0]!;
const documentId = document.documentId!;
const bytes = new TextEncoder().encode(document.canonicalUtf8!);
const doc = JSON.parse(document.canonicalUtf8!);
const png = new Uint8Array(Buffer.from(doc.atlases[0].image, "base64"));
const nextBytes = (name: string) =>
  jsonBytes({ ...doc, project: { ...doc.project, name } }, 1024 * 1024);
const empty = { version: 0, revisionId: null };
const request: ComfySubmission = {
  capabilityId: "vivi2d.provider.promptToLayerManifest.v1",
  capabilityVersion: "1.0.0",
  endpoint: "http://127.0.0.1:8188",
  providerParameters: { prompt: "synthetic public shape" },
  inputArtifacts: [],
};
const policy = { maxArtifacts: 8, maxBytes: 1024 * 1024 };
async function open(options: Partial<HostOptions> = {}) {
  const root =
    options.root ?? fs.mkdtempSync(path.join(os.tmpdir(), "vivi-local-exchange-test-"));
  if (!roots.includes(root)) roots.push(root);
  const host = await LocalExchangeHost.open({ root, ownsProcessLock: true, ...options });
  hosts.push(host);
  return { host, root };
}
afterEach(() => {
  vi.useRealTimers();
  for (const host of hosts.splice(0)) host.close();
  // Only directories allocated by this test's mkdtemp; never a checkout/cache root.
  for (const root of roots.splice(0)) {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^vivi-local-exchange-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function manifest() {
  return {
    schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
    generator: {
      plugin: "vivi2d-compat-comfyui",
      plugin_version: "0.1.0",
      model: "see-through",
      model_version: "test",
    },
    canvas: { width: 1, height: 1 },
    layers: [
      {
        id: "layer_000",
        name: "body",
        label: "body",
        order: 0,
        psd_leaf_token: "layer_000",
        image_path: "layers/layer_000.png",
        bbox: [0, 0, 1, 1],
        confidence: 1,
        left_right_split: "center",
        front_back_split: "front",
        depth_stats: { min: 0, max: 1, mean: 0.5 },
      },
    ],
  };
}
async function actualResult(
  dispatch: Awaited<ReturnType<LocalExchangeHost["start"]>>,
  pause: Promise<void> = Promise.resolve(),
) {
  let enqueued = 0;
  // Real SDK, Provider, client and orchestration. Only remote protocol transport is synthetic.
  const transport: ComfyUITransport = {
    ping: async () => true,
    getNodeInfo: async () => ({
      input: {
        required: {
          schema_version: ["STRING", { default: VIVI2D_MANIFEST_SCHEMA_VERSION }],
          plugin_version: ["STRING", { default: VIVI2D_COMPAT_PLUGIN_VERSION }],
          capability: ["STRING", { default: VIVI2D_COMPAT_CAPABILITY }],
        },
      },
    }),
    uploadImage: async () => "input.png",
    enqueue: async () => {
      enqueued++;
      return { prompt_id: "synthetic-prompt", number: 1 };
    },
    getHistory: async () => {
      await pause;
      return {
        outputs: { node: { text: ["vivi2d/decompose/public-fixture/manifest.json"] } },
        status: { completed: true },
      };
    },
    getWebSocketUrl: () => null,
    downloadOutput: async (filename) =>
      filename === "manifest.json"
        ? new TextEncoder().encode(JSON.stringify(manifest())).buffer
        : new Uint8Array(png).buffer,
  };
  const result = await invokeProvider(
    createComfyUIProvider(new ComfyUIClient({ transport, timeout: 120000 })),
    dispatch.request,
  );
  expect(enqueued).toBe(1);
  return result;
}
async function job(host: LocalExchangeHost, key = "job") {
  const workspace = await host.createWorkspace(documentId);
  return host.submit(workspace.cellId, key, request, 3, policy);
}

describe("durable local exchange / real filesystem and native PNG", () => {
  it("freezes a restored outbox whose expected head was changed without changing its candidate parent", async () => {
    const a = await open(), b = await open();
    const source = await a.host.createWorkspace(documentId);
    const target = await b.host.createMatchingReplica(source);
    const first = await b.host.publish(target.cellId, "A", empty, bytes);
    await a.host.queuePublication(
      source.cellId,
      b.host.query(target.cellId) as SyncCell,
      "C-from-A",
      nextBytes("C"),
    );
    const newer = await b.host.publish(target.cellId, "B", first.observedHead, nextBytes("B"));
    const sourceFile = path.join(a.root, "cells", `${source.cellId}.json`);
    const stored = JSON.parse(fs.readFileSync(sourceFile, "utf8")) as SyncCell;
    expect(stored.revisions.find((ref) => ref.revisionId === stored.outbox[0]!.revisionId)!.parentRevisionId)
      .toBe(first.observedHead.revisionId);
    const tampered = structuredClone(stored);
    tampered.outbox[0]!.expectedHead = newer.observedHead;
    a.host.close();
    b.host.close();
    writeFileAtomically(sourceFile, jsonBytes(tampered, 1048576));
    const receiverFile = path.join(b.root, "cells", `${target.cellId}.json`);
    const receiverBytes = fs.readFileSync(receiverFile);
    const reopenedSource = await open({ root: a.root });
    const reopenedReceiver = await open({ root: b.root });
    expect(reopenedSource.host.list().frozenCellIds).toContain(source.cellId);
    expect(() => reopenedSource.host.query(source.cellId)).toThrow("INTEGRITY");
    await expect(reopenedSource.host.deliver(source.cellId, "C-from-A", reopenedReceiver.host))
      .rejects.toThrow("INTEGRITY");
    expect((reopenedReceiver.host.query(target.cellId) as SyncCell).state.head).toEqual(newer.observedHead);
    expect(fs.readFileSync(receiverFile)).toEqual(receiverBytes);
  });
  it.each([
    { finish: "settled", alreadyFrozen: true },
    { finish: "rendererLost", alreadyFrozen: true },
    { finish: "settled", alreadyFrozen: false },
    { finish: "rendererLost", alreadyFrozen: false },
  ] as const)(
    "releases only the fenced physical slot after $finish failure (already frozen: $alreadyFrozen)",
    async ({ finish, alreadyFrozen }) => {
      let failedCell = "";
      const a = await open({ writeAtomic: (file, data) => {
        if (failedCell && path.basename(file) === `${failedCell}.json`) throw Error("cell write failed");
        writeFileAtomically(file, data);
      } });
      const first = await job(a.host, "frozen"), second = await job(a.host, "other"), third = await job(a.host, "third");
      const dispatch = await a.host.start(first.cellId, 0, "old-session");
      let release!: () => void;
      const pause = new Promise<void>((resolve) => { release = resolve; });
      // Real SDK/Comfy promise remains active while its synthetic remote response waits.
      const running = actualResult(dispatch, pause).finally(() => finish === "settled"
        ? a.host.settled(first.cellId, 1, "old-session")
        : a.host.rendererLost("old-session"));
      failedCell = first.cellId;
      if (alreadyFrozen) {
        await expect(a.host.failAttempt(first.cellId, 1, "old-session", "retryable")).rejects.toThrow("IO");
        expect(a.host.list().frozenCellIds).toContain(first.cellId);
      }
      await expect(a.host.start(second.cellId, 0, "new-session")).rejects.toThrow("BUSY");
      const completed = expect(running).rejects.toThrow(alreadyFrozen ? "INTEGRITY" : "IO");
      release();
      await completed;
      expect(a.host.list().frozenCellIds).toContain(first.cellId);
      await a.host.start(second.cellId, 0, "new-session");
      await expect(a.host.settled(first.cellId, 1, "old-session")).rejects.toThrow("STALE");
      await a.host.rendererLost("old-session");
      await expect(a.host.start(third.cellId, 0, "third-session")).rejects.toThrow("BUSY");
      expect(a.host.progress(second.cellId, 1, "new-session")).toBe(true);
      await a.host.settled(second.cellId, 1, "new-session");
      expect(() => a.host.query(first.cellId)).toThrow("INTEGRITY");
    },
  );
  it("uses actual embedded PNG preparation, retains conflict sides and exact outbox replay across roots/restarts", async () => {
    const a = await open(),
      b = await open();
    const source = await a.host.createWorkspace(documentId),
      target = await b.host.createMatchingReplica(source);
    const first = await b.host.publish(target.cellId, "first", empty, bytes);
    expect(first.outcome).toBe("published");
    await a.host.queuePublication(
      source.cellId,
      b.host.query(target.cellId) as SyncCell,
      "stale",
      nextBytes("candidate"),
    );
    await b.host.publish(target.cellId, "newer", first.observedHead, nextBytes("newer"));
    const conflict = await a.host.deliver(source.cellId, "stale", b.host);
    expect(conflict.outcome).toBe("conflict");
    const stored = a.host.query(source.cellId) as SyncCell;
    expect(stored.revisions.map((item) => item.revisionId)).toContain(
      conflict.observedHead.revisionId,
    );
    expect(stored.revisions.map((item) => item.revisionId)).toContain(
      conflict.revisionId,
    );
    a.host.close();
    b.host.close();
    const aa = await open({ root: a.root }),
      bb = await open({ root: b.root });
    expect(await aa.host.deliver(source.cellId, "stale", bb.host)).toEqual(conflict);
    expect(await bb.host.publish(target.cellId, "first", empty, bytes)).toEqual(first);
    const invalid = structuredClone(doc);
    invalid.atlases[0].image = Buffer.from(png.subarray(0, 33)).toString("base64");
    const unchanged = bb.host.query(target.cellId);
    await expect(
      bb.host.publish(
        target.cellId,
        "badpng",
        conflict.observedHead,
        jsonBytes(invalid, 1048576),
      ),
    ).rejects.toThrow();
    expect(bb.host.query(target.cellId)).toEqual(unchanged);
  });
  it("expires recovered running jobs before commands and never replays old Retry dispatch", async () => {
    const a = await open();
    const queued = await job(a.host);
    const first = await a.host.start(queued.cellId, queued.state.stateVersion, "session");
    a.host.close();
    const b = await open({ root: a.root });
    const recovered = b.host.query(queued.cellId) as JobCell;
    expect(recovered.state.phase).toBe("retryable");
    expect(recovered.state.attempt).toBe(1);
    const captured = recovered.state.stateVersion;
    const second = await b.host.start(queued.cellId, captured, "next-session");
    await expect(b.host.cancel(queued.cellId, first.cell.state.stateVersion, first.attempt)).rejects.toThrow("STALE");
    await b.host.failAttempt(queued.cellId, second.attempt, "next-session", "retryable");
    await b.host.settled(queued.cellId, second.attempt, "next-session");
    await expect(b.host.start(queued.cellId, captured, "next-session")).rejects.toThrow(
      "STALE",
    );
    const current = b.host.query(queued.cellId) as JobCell;
    expect(current.state.attempt).toBe(2);
    expect(current.commitVersion).toBe(4);
    expect(current.state.stateVersion).toBe(5);
    expect(first.attempt).toBe(1);
  });
  it("commits idle deadline expiry before abort and progress never extends the fixed lease", async () => {
    vi.useFakeTimers();
    let now = 0;
    const observed: string[] = [];
    const { host } = await open({ now: () => now, onAbort: (_session, cellId) => observed.push((host.query(cellId) as JobCell).state.phase) });
    const queued = await job(host);
    await host.start(queued.cellId, 0, "session");
    now = 119999;
    expect(host.progress(queued.cellId, 1, "session")).toBe(true);
    now = 120000;
    await vi.advanceTimersByTimeAsync(120000);
    expect(observed).toEqual(["retryable"]);
    const current = host.query(queued.cellId) as JobCell;
    await expect(host.start(queued.cellId, current.state.stateVersion, "session")).rejects.toThrow("BUSY");
    await host.settled(queued.cellId, 1, "session");
  });
  it("keeps cancelled physical promise slot until actual settlement, fences late callbacks and renderer loss", async () => {
    const { host } = await open();
    const queued = await job(host),
      other = await job(host, "other");
    const first = await host.start(queued.cellId, 0, "session");
    const result = await actualResult(first);
    await host.cancel(queued.cellId, first.cell.state.stateVersion, first.attempt);
    await expect(host.start(other.cellId, 0, "session")).rejects.toThrow("BUSY");
    expect(host.progress(queued.cellId, 1, "session")).toBe(false);
    await expect(host.complete(queued.cellId, 1, "session", result)).rejects.toThrow(
      "STALE",
    );
    await host.settled(queued.cellId, 1, "session");
    await host.start(other.cellId, 0, "session");
    await host.rendererLost("session");
    expect((host.query(other.cellId) as JobCell).state.phase).toBe("retryable");
  });
  it("checks monotonic deadline after real object storage, and committed equality before replay deadline", async () => {
    let now = 0,
      expireOnWrite = false;
    const a = await open({
      now: () => now,
      writeAtomic: (file, data) => {
        writeFileAtomically(file, data);
        if (expireOnWrite && path.dirname(file).endsWith("objects")) now = 120000;
      },
    });
    const queued = await job(a.host);
    const dispatch = await a.host.start(queued.cellId, 0, "session");
    const result = await actualResult(dispatch);
    expireOnWrite = true;
    await expect(a.host.complete(queued.cellId, 1, "session", result)).rejects.toThrow(
      "EXPIRED",
    );
    expect((a.host.query(queued.cellId) as JobCell).state.phase).toBe("retryable");
    expect(fs.readdirSync(path.join(a.root, "objects")).length).toBeGreaterThan(1);
    await a.host.settled(queued.cellId, 1, "session");
    expireOnWrite = false;
    now = 130000;
    const retry = await a.host.start(
      queued.cellId,
      (a.host.query(queued.cellId) as JobCell).state.stateVersion,
      "session",
    );
    const retryResult = await actualResult(retry);
    const committed = await a.host.complete(queued.cellId, 2, "session", retryResult);
    await a.host.settled(queued.cellId, 2, "session");
    now = 999999;
    expect(await a.host.complete(queued.cellId, 2, "old-session", retryResult)).toEqual(
      committed,
    );
    await expect(
      a.host.cancel(queued.cellId, committed.state.stateVersion, committed.state.attempt),
    ).rejects.toThrow();
    const changed = structuredClone(retryResult);
    changed.artifacts[0]!.metadata!.layerCount = 2;
    await expect(a.host.complete(queued.cellId, 2, "session", changed)).rejects.toThrow(
      "IDEMPOTENCY_MISMATCH",
    );
  });
  it("rejects duplicate effective selected labels before import and retains approved exact candidate across restart", async () => {
    const a = await open();
    const queued = await job(a.host),
      dispatch = await a.host.start(queued.cellId, 0, "session");
    const result = await actualResult(dispatch);
    const image = result.artifacts.find((item) => item.kind === "layerImage")!;
    const distinctPng = new Uint8Array(
      Buffer.from(fixture.pngCases[0]!.base64, "base64"),
    );
    expect(distinctPng).not.toEqual(new Uint8Array(image.data!));
    result.artifacts.push({
      ...image,
      id: "duplicate-label",
      byteLength: distinctPng.length,
      data: distinctPng.buffer,
    });
    await a.host.complete(queued.cellId, 1, "session", result);
    await a.host.settled(queued.cellId, 1, "session");
    expect(() =>
      a.host.proposal(
        queued.cellId,
        result.artifacts.map((item) => item.id),
      ),
    ).toThrow("BINDING");
    const selected = result.artifacts
      .filter((item) => item.id !== "duplicate-label")
      .map((item) => item.id);
    const approved = await a.host.approve(
      queued.cellId,
      "decision",
      selected,
      "project-approved",
      documentId,
      bytes,
    );
    expect(approved.state.decision.kind).toBe("undecided"); // Converted Comfy candidate is not an exact Project artifact proof.
    expect(approved.selection?.kind).toBe("project-approved");
    await expect(a.host.reject(queued.cellId, "rejected")).rejects.toThrow("TERMINAL");
    a.host.close();
    const b = await open({ root: a.root });
    expect(b.host.approvedCandidate(queued.cellId).bytes).toEqual(bytes);
    expect(
      await b.host.approve(
        queued.cellId,
        "decision",
        selected,
        "project-approved",
        documentId,
        bytes,
      ),
    ).toEqual(approved);
  });
  it("retains objects-before-cell failure, recovers cell-before-ack, and freezes corruption without reset", async () => {
    let failure: "none" | "before" | "after" = "none";
    const a = await open({
      writeAtomic: (file, data) => {
        if (file.endsWith(".json") && failure === "before") throw Error("synthetic");
        writeFileAtomically(file, data);
        if (file.endsWith(".json") && failure === "after") throw Error("synthetic");
      },
    });
    const workspace = await a.host.createWorkspace(documentId);
    failure = "before";
    await expect(a.host.publish(workspace.cellId, "first", empty, bytes)).rejects.toThrow(
      "IO",
    );
    expect(fs.existsSync(path.join(a.root, "objects", `${sha(bytes)}.bin`))).toBe(true);
    a.host.close();
    const b = await open({
      root: a.root,
      writeAtomic: (file, data) => {
        writeFileAtomically(file, data);
        if (file.endsWith(".json")) throw Error("lost ack");
      },
    });
    expect((b.host.query(workspace.cellId) as SyncCell).state.head).toEqual(empty);
    await expect(b.host.publish(workspace.cellId, "first", empty, bytes)).rejects.toThrow(
      "IO",
    );
    b.host.close();
    const c = await open({ root: a.root });
    expect((await c.host.publish(workspace.cellId, "first", empty, bytes)).outcome).toBe(
      "published",
    );
    c.host.close();
    fs.writeFileSync(
      path.join(a.root, "objects", `${sha(bytes)}.bin`),
      new Uint8Array(bytes.length),
    );
    const d = await open({ root: a.root });
    expect(d.host.list().frozenCellIds).toContain(workspace.cellId);
    expect(() => d.host.query(workspace.cellId)).toThrow("INTEGRITY");
  });
  it("enforces owner, budgets, endpoint binding and old replay without rollover", async () => {
    const a = await open({ limits: { cells: 2, objects: 2, objectBytes: 20000 } });
    await expect(
      LocalExchangeHost.open({ root: a.root, ownsProcessLock: false }),
    ).rejects.toThrow("OWNER");
    await expect(
      LocalExchangeHost.open({ root: a.root, ownsProcessLock: true }),
    ).rejects.toThrow("OWNER");
    const workspace = await a.host.createWorkspace(documentId);
    const submitted = await a.host.submit(
      workspace.cellId,
      "idempotent",
      request,
      3,
      policy,
    );
    expect(
      await a.host.submit(workspace.cellId, "idempotent", request, 3, policy),
    ).toEqual(submitted);
    await expect(
      a.host.submit(
        workspace.cellId,
        "idempotent",
        { ...request, endpoint: "http://localhost:8188" },
        3,
        policy,
      ),
    ).rejects.toThrow("IDEMPOTENCY_MISMATCH");
    await expect(a.host.createReplica(workspace.cellId)).rejects.toThrow("LIMIT");
    await expect(
      a.host.submit(
        workspace.cellId,
        "remote",
        { ...request, endpoint: "https://example.com" },
        3,
        policy,
      ),
    ).rejects.toThrow();
  });
  it("records a wrong-bound result as permanent without making any result available", async () => {
    const { host } = await open();
    const queued = await job(host),
      dispatch = await host.start(queued.cellId, 0, "session");
    const result = await actualResult(dispatch);
    result.requestId = "another-request";
    await expect(host.complete(queued.cellId, 1, "session", result)).rejects.toThrow(
      "RESULT",
    );
    expect((host.query(queued.cellId) as JobCell).state.phase).toBe("failed");
    expect(() => host.resultManifest(queued.cellId)).toThrow();
    await host.settled(queued.cellId, 1, "session");
  });
  it("independently validates ordinary import bytes with real PNG, then reopens the exact approved legacy object", async () => {
    const a = await open(), queued = await job(a.host), dispatch = await a.host.start(queued.cellId, 0, "session");
    const result = await actualResult(dispatch);
    await a.host.complete(queued.cellId, 1, "session", result); await a.host.settled(queued.cellId, 1, "session");
    const selected = result.artifacts.map((artifact) => artifact.id);
    const legacy = { version: 9, profile: "publicProfileV1", project: structuredClone(doc.project), atlases: structuredClone(doc.atlases) };
    const invalid = structuredClone(legacy); invalid.atlases[0].image = Buffer.from(png.subarray(0, 33)).toString("base64");
    await expect(a.host.approve(queued.cellId, "bad", selected, "import-approved", documentId, jsonBytes(invalid, 1048576))).rejects.toThrow();
    expect((a.host.query(queued.cellId) as JobCell).selection).toBeNull();
    const candidate = jsonBytes(legacy, 1048576);
    parseViviFile(new TextDecoder().decode(candidate), { profile: "publicProfileV1" });
    const approved = await a.host.approve(queued.cellId, "ordinary", selected, "import-approved", documentId, candidate);
    expect(approved.selection?.candidate?.revision).toBeNull();
    expect(approved.state.decision.kind).toBe("undecided");
    expect(approved.outbox).toBeNull();
    a.host.close(); const b = await open({ root: a.root });
    expect(b.host.approvedCandidate(queued.cellId).bytes).toEqual(candidate);
    expect((b.host.query(queued.cellId) as JobCell).selection?.kind).toBe("import-approved");
  });
  it("keeps converted Project approval after receiver CAS conflict and retains the observed revision", async () => {
    const a = await open();
    const source = await a.host.createWorkspace(documentId),
      target = await a.host.createReplica(source.cellId);
    const queued = await a.host.submit(source.cellId, "conversion", request, 3, policy);
    const dispatch = await a.host.start(queued.cellId, 0, "session"),
      result = await actualResult(dispatch);
    await a.host.complete(queued.cellId, 1, "session", result);
    await a.host.settled(queued.cellId, 1, "session");
    const selected = result.artifacts.map((artifact) => artifact.id);
    await a.host.approve(
      queued.cellId,
      "approve",
      selected,
      "project-approved",
      documentId,
      bytes,
      { cellId: target.cellId, mutationId: "proposal", expectedHead: empty },
    );
    await a.host.publish(target.cellId, "intervening", empty, nextBytes("intervening"));
    const receipt = await a.host.deliverApproved(queued.cellId);
    expect(receipt.outcome).toBe("conflict");
    expect((a.host.query(queued.cellId) as JobCell).selection?.kind).toBe(
      "project-approved",
    );
    expect(a.host.approvedCandidate(queued.cellId).bytes).toEqual(bytes);
    a.host.close();
    const b = await open({ root: a.root });
    expect(await b.host.deliverApproved(queued.cellId)).toEqual(receipt);
    expect(b.host.list().frozenCellIds).toEqual([]);
  });
  it("recovers source acknowledgement loss without repeating the receiver mutation after a newer head", async () => {
    let loseAck = false;
    const a = await open({
      writeAtomic: (file, data) => {
        if (loseAck && file.endsWith(".json"))
          throw Error("synthetic acknowledgement failure");
        writeFileAtomically(file, data);
      },
    });
    const b = await open();
    const source = await a.host.createWorkspace(documentId),
      target = await b.host.createMatchingReplica(source);
    await a.host.queuePublication(source.cellId, target, "one", bytes);
    loseAck = true;
    await expect(a.host.deliver(source.cellId, "one", b.host)).rejects.toThrow("IO");
    const first = (b.host.query(target.cellId) as SyncCell).state.head;
    await b.host.publish(target.cellId, "two", first, nextBytes("later"));
    a.host.close();
    const reopened = await open({ root: a.root });
    const replay = await reopened.host.deliver(source.cellId, "one", b.host);
    expect(replay.observedHead).toEqual(first);
    expect((b.host.query(target.cellId) as SyncCell).state.head.version).toBe(2);
  });
});
