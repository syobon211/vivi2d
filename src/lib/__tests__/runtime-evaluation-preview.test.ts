import { webcrypto } from "node:crypto";
import type { ReadOnlyAuthoringHost } from "@vivi2d/editor-host";
import type { NativeEvaluationRuntime } from "@vivi2d/runtime-wasm/internal/evaluation-runtime-v1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluationProject,
  PNG_HASH,
  pngBytes,
  verifiedTexture,
} from "../../../packages/runtime-wasm/src/__tests__/fixtures/evaluation-project";
import { createRuntimeEvaluationPreview } from "../runtime-evaluation-preview";

const state = vi.hoisted(() => ({
  captures: vi.fn(),
  cancellations: vi.fn(),
  hosts: [] as ReadOnlyAuthoringHost[],
  gpu: undefined as undefined | ReturnType<typeof gpuFake>,
  instances: 0,
  forceRetired: false,
  sessions: [] as Array<{ host: ReadOnlyAuthoringHost; id: string; generation: number }>,
  builtSessions: [] as string[],
  nativePrepares: 0,
  nextPortDelay: undefined as undefined | { wait: Promise<void>; entered(): void },
}));
function gpuFake() {
  let active: unknown = null;
  return {
    prepareEvaluationModel: vi.fn((snapshot: unknown) => ({ snapshot })),
    validatePreparedEvaluation: vi.fn(),
    commitPreparedEvaluation: vi.fn((pending: unknown) => {
      const old = active;
      active = pending;
      return old;
    }),
    finalizeEvaluation: vi.fn(),
    discardPreparedEvaluation: vi.fn(),
    render: vi.fn(),
    recoverEvaluation: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
}
vi.mock("@vivi2d/renderer-pixi", () => ({
  ViviPixiRenderer: { create: async () => (state.gpu = gpuFake()) },
}));
vi.mock("../local-asset-copy", () => ({
  localAssetCopy: (request: { operation: string }) =>
    request.operation === "preview" ? state.captures() : state.cancellations(),
}));
vi.mock("@vivi2d/editor-host", async (original) => {
  const actual = await original<typeof import("@vivi2d/editor-host")>();
  return {
    ...actual,
    createReadOnlyAuthoringHost: (
      ...args: Parameters<typeof actual.createReadOnlyAuthoringHost>
    ) => {
      const options = args[0];
      const host = actual.createReadOnlyAuthoringHost({
        ...options,
        async resolveReferencedAtlas(request) {
          const delay = state.nextPortDelay;
          state.nextPortDelay = undefined;
          const result = await options.resolveReferencedAtlas!(request);
          delay?.entered();
          if (delay) await delay.wait;
          return result;
        },
      });
      state.hosts.push(host);
      // Test-only observer: IDs/generations are issued solely by the actual host.
      // The browser/Windows proofs separately use its unwrapped frozen methods.
      return Object.freeze({
        ...host,
        async initUtf8(source: Uint8Array) {
          const result = await host.initUtf8(source);
          state.sessions.push({
            host,
            id: result.sessionId,
            generation: result.snapshot.requestGeneration,
          });
          return result;
        },
        buildRuntimePayload(id: string) {
          state.builtSessions.push(id);
          return host.buildRuntimePayload(id);
        },
      });
    },
  };
});
vi.mock("@vivi2d/runtime-wasm/internal/evaluation-runtime-v1", async (original) => {
  const actual =
    await original<
      typeof import("@vivi2d/runtime-wasm/internal/evaluation-runtime-v1")
    >();
  return {
    ...actual,
    createNativeEvaluationRuntime: async () => {
      state.instances++;
      const result = await actual.createNativeEvaluationRuntime();
      return result.ok
        ? {
            ok: true,
            value: {
              ...result.value,
              isRetired: () => state.forceRetired || result.value.isRetired(),
              prepare(input: Parameters<NativeEvaluationRuntime["prepare"]>[0]) {
                state.nativePrepares++;
                return result.value.prepare(input);
              },
            },
          }
        : result;
    },
  };
});
const CELL = "c".repeat(64);
function capture() {
  return {
    kind: "runtimePreviewV1",
    cellId: CELL,
    documentId: "11111111-1111-1111-1111-111111111111",
    commitVersion: 1,
    sourceBytes: new TextEncoder().encode(JSON.stringify(evaluationProject())),
    objects: [{ objectAddress: PNG_HASH, bytes: pngBytes() }],
    atlasResolutions: [
      { atlasId: "atlas", status: "ready", verified: verifiedTexture() },
    ],
  };
}
const create = () =>
  createRuntimeEvaluationPreview({
    cellId: CELL,
    canvas: document.createElement("canvas"),
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  state.hosts.length = 0;
  state.instances = 0;
  state.forceRetired = false;
  state.sessions.length = 0;
  state.builtSessions.length = 0;
  state.nativePrepares = 0;
  state.nextPortDelay = undefined;
  state.captures.mockReset().mockImplementation(async () => capture());
  state.cancellations.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("preview composition with real EDH/native and a control-only GPU seam", () => {
  it("activates without update(0), exposes fresh controls, and closes its actual session", async () => {
    const preview = await create();
    try {
      const loaded = await preview.load();
      expect(loaded).toMatchObject({
        ok: true,
        status: "activated",
        generations: { dynamic: "0" },
      });
      expect(loaded.ok && loaded.parameters?.[0]).toMatchObject({
        current: 0,
        evaluated: 0,
      });
      expect(preview.setParameter("p", 0.25)).toMatchObject({
        ok: true,
        status: "updated",
        parameters: [expect.objectContaining({ current: 0.25, evaluated: 0.25 })],
      });
      expect(preview.applyPreset("one")).toMatchObject({
        ok: true,
        parameters: [expect.objectContaining({ current: 1, evaluated: 1 })],
      });
      expect(preview.setParameter("p", 0.25, Number.NaN)).toMatchObject({
        ok: false,
        code: "native",
        parameters: [expect.objectContaining({ current: 0.25, evaluated: 1 })],
      });
      expect(state.hosts).toHaveLength(1);
      expect(Object.isFrozen(state.hosts[0])).toBe(true);
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(1);
      expect(() => state.hosts[0]!.getSnapshot(state.sessions[0]!.id)).toThrowError(
        expect.objectContaining({ code: "VIVI_EDITOR_HOST_SESSION_DISPOSED" }),
      );
    } finally {
      preview.close();
    }
    expect(preview.setParameter("p", 0)).toEqual({ ok: false, code: "disposed" });
    expect(state.gpu!.destroy).toHaveBeenCalledTimes(1);
  });

  it("disposes real late-init sessions after replacement/Close and both terminal Missing phases", async () => {
    const gate = () => {
      let entered!: () => void, release!: () => void;
      const observed = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      state.nextPortDelay = { wait, entered };
      return { observed, release };
    };
    const disposed = (index: number) => {
      const session = state.sessions[index]!;
      expect(() => session.host.getSnapshot(session.id)).toThrowError(
        expect.objectContaining({ code: "VIVI_EDITOR_HOST_SESSION_DISPOSED" }),
      );
    };
    const preview = await create();
    try {
      const firstGate = gate(),
        old = preview.load();
      await firstGate.observed;
      const newer = preview.load();
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(1);
      firstGate.release();
      expect(await old).toEqual({ ok: true, status: "superseded" });
      expect(await newer).toMatchObject({ ok: true, status: "activated" });
      expect(state.sessions.map((s) => s.generation)).toEqual([1, 2]);
      disposed(0);
      disposed(1);
      expect(state.builtSessions).toEqual([state.sessions[1]!.id]);
      expect(state.nativePrepares).toBe(1);
      const closeGate = gate(),
        closing = preview.load();
      await closeGate.observed;
      preview.close();
      closeGate.release();
      expect(await closing).toEqual({ ok: true, status: "superseded" });
      disposed(2);
      expect(state.builtSessions).toEqual([state.sessions[1]!.id]);
      expect(state.nativePrepares).toBe(1);
    } finally {
      preview.close();
    }

    const missingPreview = await create();
    try {
      state.captures.mockResolvedValueOnce({
        ...capture(),
        atlasResolutions: [{ atlasId: "atlas", status: "missing" }],
      });
      expect(await missingPreview.load()).toEqual({ ok: true, status: "missing" });
      disposed(3); // Actual EDH init Missing: no payload or native prepare.
      expect(state.nativePrepares).toBe(1);
      state.captures.mockResolvedValueOnce({ ...capture(), objects: [] });
      expect(await missingPreview.load()).toEqual({ ok: true, status: "missing" });
      disposed(4); // Actual postseal Missing: same UI deliberately offers no Retry.
      expect(state.nativePrepares).toBe(2);
    } finally {
      missingPreview.close();
    }
  });

  it("reports Activated even when post-publication GPU cleanup throws", async () => {
    const preview = await create();
    state.gpu!.finalizeEvaluation.mockImplementation(() => {
      throw new Error("private GPU detail");
    });
    try {
      expect(await preview.load()).toMatchObject({
        ok: true,
        status: "activated",
        cleanupFailed: true,
      });
      expect(state.gpu!.discardPreparedEvaluation).not.toHaveBeenCalled();
      expect(state.gpu!.render).toHaveBeenCalledOnce();
    } finally {
      preview.close();
    }
  });

  it("discards only unselected GPU preparation and retains fresh controls after validation failure", async () => {
    const preview = await create();
    try {
      expect((await preview.load()).ok).toBe(true);
      state.gpu!.validatePreparedEvaluation.mockImplementationOnce(() => {
        throw new Error("TEST_GPU_VALIDATE_FAILURE");
      });
      expect(preview.setParameter("p", 0.75)).toMatchObject({
        ok: false,
        code: "unavailable",
        parameters: [expect.objectContaining({ current: 0.75, evaluated: 0.75 })],
      });
      const failedPreparation =
        state.gpu!.prepareEvaluationModel.mock.results.at(-1)!.value;
      expect(state.gpu!.discardPreparedEvaluation).toHaveBeenCalledExactlyOnceWith(
        failedPreparation,
      );
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledTimes(1);
      state.gpu!.finalizeEvaluation.mockImplementationOnce(() => {
        throw new Error("TEST_POST_SELECTION_CLEANUP");
      });
      expect(preview.setParameter("p", 0.5)).toMatchObject({
        ok: false,
        code: "unavailable",
        parameters: [expect.objectContaining({ current: 0.5, evaluated: 0.5 })],
      });
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledTimes(2);
      expect(state.gpu!.discardPreparedEvaluation).toHaveBeenCalledTimes(1);
    } finally {
      preview.close();
    }
  });

  it("rejects concurrent capture without invalidating its admitted attempt or incumbent", async () => {
    const preview = await create();
    const response = deferred<ReturnType<typeof capture>>();
    let pending: ReturnType<typeof preview.load> | undefined;
    try {
      expect(await preview.load()).toMatchObject({ ok: true, status: "activated" });
      state.captures.mockImplementationOnce(() => response.promise);
      pending = preview.load();
      expect(await preview.load()).toEqual({ ok: false, code: "busy" });
      expect(state.captures).toHaveBeenCalledTimes(2);
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(1);
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledTimes(1);
      response.resolve(capture());
      expect(await pending).toMatchObject({ ok: true, status: "activated" });
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(2);
    } finally {
      response.resolve(capture());
      await pending;
      preview.close();
    }
  });

  it("does not cancel another capture when a never-loaded or post-capture instance closes", async () => {
    const idle = await create();
    const loading = await create();
    const response = deferred<ReturnType<typeof capture>>();
    const entered = deferred<void>(),
      release = deferred<void>();
    let pending: ReturnType<typeof loading.load> | undefined;
    let initializing: Awaited<ReturnType<typeof create>> | undefined;
    let oldInit: ReturnType<typeof loading.load> | undefined;
    try {
      state.captures.mockImplementationOnce(() => response.promise);
      pending = loading.load();
      idle.close();
      expect(state.cancellations).not.toHaveBeenCalled();
      response.resolve(capture());
      expect(await pending).toMatchObject({ ok: true, status: "activated" });

      initializing = await create();
      state.nextPortDelay = { wait: release.promise, entered: () => entered.resolve() };
      oldInit = initializing.load();
      await entered.promise;
      const nextResponse = deferred<ReturnType<typeof capture>>();
      state.captures.mockImplementationOnce(() => nextResponse.promise);
      pending = loading.load();
      try {
        initializing.close();
        expect(state.cancellations).not.toHaveBeenCalled();
      } finally {
        nextResponse.resolve(capture());
        release.resolve();
      }
      expect(await oldInit).toEqual({ ok: true, status: "superseded" });
      expect(await pending).toMatchObject({ ok: true, status: "activated" });
      const disposed = state.sessions.find((session) => session.host === state.hosts[2]);
      expect(disposed).toBeDefined();
      expect(() => disposed!.host.getSnapshot(disposed!.id)).toThrowError(
        expect.objectContaining({ code: "VIVI_EDITOR_HOST_SESSION_DISPOSED" }),
      );
    } finally {
      response.resolve(capture());
      release.resolve();
      await Promise.all([pending, oldInit]);
      idle.close();
      initializing?.close();
      loading.close();
    }
  });

  it.each([
    "capture-first",
    "cancel-first",
  ] as const)("holds capture ownership until both IPC replies settle (%s)", async (order) => {
    const closing = await create(),
      next = await create();
    const response = deferred<ReturnType<typeof capture>>(),
      cancellation = deferred<null>();
    state.captures.mockImplementationOnce(() => response.promise);
    state.cancellations.mockImplementationOnce(() => cancellation.promise);
    const pending = closing.load();
    try {
      closing.close();
      closing.close();
      expect(state.cancellations).toHaveBeenCalledOnce();
      if (order === "capture-first") {
        response.resolve(capture());
        await response.promise;
      } else {
        cancellation.resolve(null);
        await cancellation.promise;
      }
      expect(await next.load()).toEqual({ ok: false, code: "busy" });
      expect(state.captures).toHaveBeenCalledOnce();
      response.resolve(capture());
      cancellation.resolve(null);
      expect(await pending).toEqual({ ok: true, status: "superseded" });
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(0);
      expect(await next.load()).toMatchObject({ ok: true, status: "activated" });
      expect(state.nativePrepares).toBe(1);
      closing.close();
      expect(state.cancellations).toHaveBeenCalledOnce();
    } finally {
      response.resolve(capture());
      cancellation.resolve(null);
      await pending;
      closing.close();
      next.close();
    }
  });

  it("retains the committed owner on render failure, reports a caution, and permits explicit Reload", async () => {
    const preview = await create();
    try {
      state.gpu!.render.mockImplementationOnce(() => {
        throw new Error("TEST_ENTERED_RENDER_FAILURE");
      });
      expect(await preview.load()).toMatchObject({
        ok: true,
        status: "activated",
        cleanupFailed: true,
      });
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledOnce();
      expect(state.gpu!.discardPreparedEvaluation).not.toHaveBeenCalled();
      expect(await preview.load()).toMatchObject({ ok: true, status: "activated" });
      expect(state.gpu!.recoverEvaluation).toHaveBeenCalledTimes(2);
      state.gpu!.render.mockImplementationOnce(() => {
        throw new Error("TEST_ENTERED_RENDER_FAILURE");
      });
      expect(preview.setParameter("p", 0.5)).toMatchObject({
        ok: false,
        code: "unavailable",
        parameters: [expect.objectContaining({ current: 0.5, evaluated: 0.5 })],
      });
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledTimes(3);
      expect(state.gpu!.discardPreparedEvaluation).not.toHaveBeenCalled();
    } finally {
      preview.close();
    }
  });

  it("bounds an untrusted capture before getters and leaves the incumbent installed", async () => {
    const preview = await create();
    try {
      expect((await preview.load()).ok).toBe(true);
      const dto = capture(),
        getter = vi.fn(() => pngBytes());
      Object.defineProperty(dto, "sourceBytes", { get: getter });
      state.captures.mockResolvedValueOnce(dto);
      expect(await preview.load()).toEqual({ ok: false, code: "invalid" });
      expect(getter).not.toHaveBeenCalled();
      expect(state.gpu!.commitPreparedEvaluation).toHaveBeenCalledTimes(1);
    } finally {
      preview.close();
    }
  });

  it("creates a replacement native instance only on explicit Reload and keeps the sole EDH issuer", async () => {
    const preview = await create();
    try {
      expect((await preview.load()).ok).toBe(true);
      state.forceRetired = true; // Lifecycle branch injection; export trap mechanics have separate tests.
      expect(state.instances).toBe(1);
      expect(await preview.load()).toMatchObject({ ok: true, status: "activated" });
      expect(state.instances).toBe(2);
      expect(state.hosts).toHaveLength(1);
      expect(state.hosts[0]!.getRequestState().latestIssuedGeneration).toBe(2);
    } finally {
      preview.close();
    }
  });
});
