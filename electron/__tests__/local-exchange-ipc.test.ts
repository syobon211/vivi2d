// @vitest-environment node
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { LocalExchangeHost } from "../local-exchange-host";
const { wrapHandler } = require("../security.cjs");
const { validateIpcArgs } = require("../ipc-contract.cjs");
const { register } = require("../ipc/local-exchange.cjs");
const roots: string[] = [],
  closers: (() => void)[] = [];
afterEach(() => {
  closers.splice(0).forEach((close) => close());
  for (const root of roots.splice(0)) {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^vivi-local-ipc-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it("uses the real wrapper for trusted sender, closed commands and session-loss expiry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-local-ipc-test-"));
  roots.push(root);
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const contents = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const window = { webContents: contents, isDestroyed: () => false };
  const host = await register({
    handle: wrapHandler(
      { handle: (channel: string, handler: any) => handlers.set(channel, handler) },
      () => window,
    ),
    appData: root,
    ownsProcessLock: true,
    Host: LocalExchangeHost,
    getMainWindow: () => window,
  });
  closers.push(host.close);
  const invoke = (command: unknown, sender = contents, parent: unknown = null) =>
    handlers.get("local-exchange")!({ sender, senderFrame: { parent } }, command);
  await expect(invoke({ action: "list" }, { id: 2 } as typeof contents)).rejects.toThrow(
    "sender",
  );
  await expect(invoke({ action: "list" }, contents, {})).rejects.toThrow("child frames");
  await expect(invoke({ action: "list", path: "arbitrary" })).rejects.toThrow(
    "Invalid local exchange",
  );
  const workspace = await invoke({
    action: "createWorkspace",
    documentId: "123e4567-e89b-42d3-a456-426614174000",
  });
  expect(workspace.ok).toBe(true);
  const queued = await invoke({
    action: "submit",
    workspaceId: workspace.value.cellId,
    submissionKey: "job",
    request: {
      capabilityId: "vivi2d.provider.promptToLayerManifest.v1",
      capabilityVersion: "1.0.0",
      endpoint: "http://127.0.0.1:8188",
      providerParameters: { prompt: "synthetic" },
      inputArtifacts: [],
    },
    maxAttempts: 3,
    resultPolicy: { maxArtifacts: 4, maxBytes: 10000 },
  });
  expect(queued.ok).toBe(true);
  const dispatch = await invoke({
    action: "start",
    cellId: queued.value.cellId,
    expectedStateVersion: 0,
  });
  expect(dispatch.ok).toBe(true);
  contents.emit("did-start-navigation", {}, "about:blank", false, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const recovered = await invoke({ action: "query", cellId: queued.value.cellId });
  expect(recovered.value.state.phase).toBe("retryable");
  expect(
    await invoke({
      action: "start",
      cellId: queued.value.cellId,
      expectedStateVersion: 0,
    }),
  ).toEqual({ ok: false, code: "STALE" });
  expect(
    await invoke({ action: "progress", cellId: queued.value.cellId, attempt: 1 }),
  ).toEqual({ ok: true, value: false });
});
it("rejects every unknown/path-bearing action envelope without host access", () => {
  for (const action of [
    "list",
    "query",
    "createWorkspace",
    "createReplica",
    "publish",
    "queuePublication",
    "deliver",
    "deliverApproved",
    "submit",
    "start",
    "cancel",
    "progress",
    "settled",
    "fail",
    "complete",
    "result",
    "proposal",
    "reject",
    "candidate",
    "approve",
    "unknown",
  ]) {
    expect(() =>
      validateIpcArgs("local-exchange", [{ action, path: "arbitrary" }]),
    ).toThrow();
  }
  expect(() =>
    validateIpcArgs("local-exchange", [
      {
        action: "start",
        cellId: "a".repeat(64),
        expectedStateVersion: Number.MAX_SAFE_INTEGER + 1,
      },
    ]),
  ).toThrow();
  expect(() =>
    validateIpcArgs("local-exchange", [
      {
        action: "complete",
        cellId: "a".repeat(64),
        attempt: 1,
        result: {
          requestId: "r",
          capabilityId: "c",
          artifacts: [
            { id: "x", data: new Uint8Array([1]), path: "x", ambientFile: "x" },
          ],
          warnings: [],
          provenance: {},
        },
      },
    ]),
  ).toThrow();
});
