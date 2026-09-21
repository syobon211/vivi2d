import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "@vivi2d/provider-comfyui";
import { afterEach, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import {
  type JobCell,
  LocalExchangeHost,
  type SyncCell,
} from "../../../electron/local-exchange-host";
import fixture from "../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { exchange, runLocalJob } from "../local-exchange-provider";
import { getAllTextures } from "../texture-store";

const { register } = require("../../../electron/ipc/local-exchange.cjs");
const { wrapHandler } = require("../../../electron/security.cjs");
let cleanup = () => {};
afterEach(() => {
  cleanup();
  cleanup = () => {};
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("runs the real renderer dispatcher through the host and actual SDK/Comfy transport, retaining cancel slots until the promise settles", async () => {
  // This fixture exercises the existing contracted IPC polling route only.
  vi.stubGlobal("WebSocket", undefined);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-local-renderer-test-"));
  const abortListeners = new Set<
    (message: { cellId: string; attempt: number }) => void
  >();
  const contents = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: (_channel: string, message: { cellId: string; attempt: number }) =>
      abortListeners.forEach((listener) => {
        listener(message);
      }),
  });
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const windowOwner = { webContents: contents, isDestroyed: () => false };
  const registered = await register({
    handle: wrapHandler(
      { handle: (channel: string, handler: any) => handlers.set(channel, handler) },
      () => windowOwner,
    ),
    appData: root,
    ownsProcessLock: true,
    Host: LocalExchangeHost,
    getMainWindow: () => windowOwner,
  });
  const previous = { ...window.electronAPI };
  cleanup = () => {
    registered.close();
    Object.assign(window.electronAPI, previous);
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^vivi-local-renderer-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  };
  window.electronAPI.localExchange = (command) =>
    handlers.get("local-exchange")!(
      { sender: contents, senderFrame: { parent: null } },
      command,
    );
  window.electronAPI.onLocalExchangeAbort = (listener) => {
    abortListeners.add(listener);
    return () => abortListeners.delete(listener);
  };
  const completedCells: string[] = [];
  const actualExchange = window.electronAPI.localExchange;
  window.electronAPI.localExchange = (command) => {
    if (command.action === "complete") completedCells.push(command.cellId as string);
    return actualExchange(command);
  };
  const image = new Uint8Array(
    Buffer.from(
      JSON.parse(fixture.documents[0]!.canonicalUtf8!).atlases[0].image,
      "base64",
    ),
  );
  const manifest = {
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
        id: "layer",
        name: "body",
        label: "body",
        order: 0,
        psd_leaf_token: "layer",
        image_path: "layers/layer.png",
        bbox: [0, 0, 1, 1],
        confidence: 1,
        left_right_split: "center",
        front_back_split: "front",
        depth_stats: { min: 0, max: 1, mean: 0.5 },
      },
    ],
  };
  let historyStarted!: () => void,
    releaseHistory!: (value: Record<string, unknown>) => void;
  const started = new Promise<void>((resolve) => {
    historyStarted = resolve;
  });
  const history = new Promise<Record<string, unknown>>((resolve) => {
    releaseHistory = resolve;
  });
  const completeHistory = {
    outputs: { node: { text: ["vivi2d/decompose/fixture/manifest.json"] } },
    status: { completed: true },
  };
  let blocking = true,
    invocations = 0;
  window.electronAPI.comfyuiNodeInfo = async () => ({
    input: {
      required: {
        schema_version: ["STRING", { default: VIVI2D_MANIFEST_SCHEMA_VERSION }],
        plugin_version: ["STRING", { default: VIVI2D_COMPAT_PLUGIN_VERSION }],
        capability: ["STRING", { default: VIVI2D_COMPAT_CAPABILITY }],
      },
    },
  });
  window.electronAPI.comfyuiEnqueue = async () => {
    invocations++;
    return { prompt_id: `fixture-${invocations}`, number: invocations };
  };
  window.electronAPI.comfyuiHistory = async () => {
    historyStarted();
    return blocking ? history : completeHistory;
  };
  window.electronAPI.comfyuiDownload = async ({ filename }) =>
    filename === "manifest.json"
      ? new TextEncoder().encode(JSON.stringify(manifest)).buffer
      : image.buffer;
  const workspace = await exchange<SyncCell>({
    action: "createWorkspace",
    documentId: "123e4567-e89b-42d3-a456-426614174000",
  });
  async function queued(submissionKey: string) {
    return exchange<JobCell>({
      action: "submit",
      workspaceId: workspace.cellId,
      submissionKey,
      maxAttempts: 3,
      resultPolicy: { maxArtifacts: 4, maxBytes: 100000 },
      request: {
        capabilityId: "vivi2d.provider.promptToLayerManifest.v1",
        capabilityVersion: "1.0.0",
        endpoint: "http://127.0.0.1:8188",
        providerParameters: { prompt: "public synthetic" },
        inputArtifacts: [],
      },
    });
  }
  const first = await queued("first"),
    second = await queued("second");
  expect(invocations).toBe(0);
  const initialProject = useEditorStore.getState().project,
    textureCount = getAllTextures().size;
  const running = runLocalJob(first.cellId, first.state.stateVersion).then(
    () => true,
    () => false,
  );
  await started;
  await exchange({
    action: "cancel",
    cellId: first.cellId,
    expectedStateVersion: 1,
    attempt: 1,
  });
  await expect(runLocalJob(second.cellId, second.state.stateVersion)).rejects.toThrow(
    "BUSY",
  );
  expect(invocations).toBe(1);
  blocking = false;
  releaseHistory(completeHistory);
  expect(await running).toBe(false);
  expect(abortListeners.size).toBe(0);
  await runLocalJob(second.cellId, second.state.stateVersion);
  expect(invocations).toBe(2);
  expect(
    (await exchange<JobCell>({ action: "query", cellId: second.cellId })).state.phase,
  ).toBe("succeeded");
  await expect(runLocalJob(second.cellId, second.state.stateVersion)).rejects.toThrow(
    "STALE",
  );
  expect(invocations).toBe(2);
  expect(useEditorStore.getState().project).toBe(initialProject);
  expect(getAllTextures().size).toBe(textureCount);
  const callbackFailure = await queued("callback-failure");
  await expect(
    runLocalJob(callbackFailure.cellId, callbackFailure.state.stateVersion, () => {
      throw new Error("synthetic renderer callback failure");
    }),
  ).rejects.toThrow("LOCAL_EXCHANGE_ATTEMPT_FAILED");
  expect(
    (await exchange<JobCell>({ action: "query", cellId: callbackFailure.cellId })).state
      .phase,
  ).toBe("retryable");
  expect(invocations).toBe(2);
  expect(abortListeners.size).toBe(0);
  const afterCallback = await queued("after-callback");
  await runLocalJob(afterCallback.cellId, afterCallback.state.stateVersion);
  expect(invocations).toBe(3);
  // Actual Provider/SDK validation rejects the malformed remote manifest before
  // the main-process completion validator is called.
  const badArtifact = await queued("bad-artifact");
  const validDownload = window.electronAPI.comfyuiDownload;
  window.electronAPI.comfyuiDownload = async ({ filename }) =>
    filename === "manifest.json"
      ? new TextEncoder().encode('{"schema_version":"invalid"}').buffer
      : image.buffer;
  await expect(
    runLocalJob(badArtifact.cellId, badArtifact.state.stateVersion),
  ).rejects.toThrow("LOCAL_EXCHANGE_ATTEMPT_FAILED");
  const badState = await exchange<JobCell>({
    action: "query",
    cellId: badArtifact.cellId,
  });
  expect(badState.state.phase).toBe("failed");
  expect(badState.sdkResult).toBeNull();
  expect(completedCells).not.toContain(badArtifact.cellId);
  await expect(
    exchange({ action: "result", cellId: badArtifact.cellId }),
  ).rejects.toThrow();
  expect(abortListeners.size).toBe(0);
  window.electronAPI.comfyuiDownload = validDownload;
  const afterBadArtifact = await queued("after-bad-artifact");
  await runLocalJob(afterBadArtifact.cellId, afterBadArtifact.state.stateVersion);
  expect(
    (await exchange<JobCell>({ action: "query", cellId: afterBadArtifact.cellId })).state
      .phase,
  ).toBe("succeeded");
  expect(invocations).toBe(5);
  expect(abortListeners.size).toBe(0);
});
