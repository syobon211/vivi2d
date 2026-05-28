import { afterEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import {
  VIVI_RUNTIME_ERROR_CODES,
  ViviRuntimeError,
  createViviWasmRuntime,
  type ViviWasmRuntime,
} from "@vivi2d/runtime-wasm";

type RuntimePayload = Parameters<ViviWasmRuntime["load"]>[0];
type RuntimeOptions = NonNullable<Parameters<ViviWasmRuntime["load"]>[1]>;
type RuntimeErrorCode = ViviRuntimeError["code"];

const canonicalRuntimeErrors = new Set<RuntimeErrorCode>([
  VIVI_RUNTIME_ERROR_CODES.invalidArgument,
  VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
  VIVI_RUNTIME_ERROR_CODES.parse,
  VIVI_RUNTIME_ERROR_CODES.privateProfile,
  VIVI_RUNTIME_ERROR_CODES.limitExceeded,
  VIVI_RUNTIME_ERROR_CODES.validation,
  VIVI_RUNTIME_ERROR_CODES.texture,
  VIVI_RUNTIME_ERROR_CODES.evaluation,
  VIVI_RUNTIME_ERROR_CODES.internal,
]);

function cloneFixture(name = "basic-mesh"): RuntimePayload {
  return JSON.parse(
    JSON.stringify(readRuntimeConformanceFixture(name).fileData),
  ) as RuntimePayload;
}

async function expectRuntimeError(
  callback: () => unknown | Promise<unknown>,
  expected?: RuntimeErrorCode,
): Promise<ViviRuntimeError> {
  let caught: unknown;
  try {
    await callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ViviRuntimeError);
  const runtimeError = caught as ViviRuntimeError;
  expect(canonicalRuntimeErrors.has(runtimeError.code)).toBe(true);
  if (expected) expect(runtimeError.code).toBe(expected);
  return runtimeError;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("@vivi2d/runtime-wasm hardening", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps WebAssembly host initialization failures to canonical errors", async () => {
    vi.stubGlobal("WebAssembly", undefined);

    const error = await expectRuntimeError(
      () => createViviWasmRuntime({ backend: "native" }),
      VIVI_RUNTIME_ERROR_CODES.internal,
    );
    expect(error.message).toContain("failed to initialize native runtime wasm backend");
  });

  it("does not require native byte decoding when portable backend is forced", async () => {
    vi.stubGlobal("atob", undefined);
    vi.stubGlobal("Buffer", undefined);

    const runtime = await createViviWasmRuntime({ backend: "portable" });

    expect(runtime.getBackendInfo()).toMatchObject({
      backendPreference: "portable",
      selectedBackend: "portable",
      nativeAvailable: false,
      evaluator: "portable-typescript",
    });
  });

  it("normalizes fuzzed parser and direct-load failures to canonical errors", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    const malformedJson = [
      "",
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({
        version: 10,
        profile: "publicProfileV1",
        project: null,
        atlases: [],
      }),
    ];

    for (const payload of malformedJson) {
      await expectRuntimeError(() => runtime.parse(payload));
    }

    const hostileGetter = {};
    Object.defineProperty(hostileGetter, "profile", {
      enumerable: true,
      get() {
        throw new Error("hostile profile getter");
      },
    });

    const cyclicPayload = cloneFixture();
    (cyclicPayload.project.layers[0]!.children as unknown[]).push(
      cyclicPayload.project.layers[0]!,
    );

    for (const payload of [
      null,
      [],
      {},
      hostileGetter,
      {
        version: 10,
        profile: "publicProfileV1",
        project: null,
        atlases: [],
      },
      cyclicPayload,
    ]) {
      await expectRuntimeError(() => runtime.load(payload as RuntimePayload));
    }
  });

  it("accepts shared-reference arrays without treating them as cycles", async () => {
    const runtime = await createViviWasmRuntime();
    const sharedEmptyList: [] = [];
    const dagPayload = cloneFixture();
    dagPayload.project.clips = sharedEmptyList;
    dagPayload.project.scenes = sharedEmptyList;

    expect(() => runtime.load(dagPayload)).not.toThrow();
  });

  it("fails closed on allocation and structural limit overrides", async () => {
    const runtime = await createViviWasmRuntime();

    await expectRuntimeError(
      () => runtime.parse(JSON.stringify(cloneFixture()), { maxPayloadBytes: 8 }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );
    await expectRuntimeError(
      () => runtime.load(cloneFixture(), { maxTextureBytes: 1 }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );
    await expectRuntimeError(
      () => runtime.load(cloneFixture(), { limits: { maxMeshes: 0 } }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );
    await expectRuntimeError(
      () => runtime.load(cloneFixture(), { limits: { maxVerticesPerMesh: 2 } }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );
    await expectRuntimeError(
      () => runtime.load(cloneFixture(), { limits: { maxIndicesPerMesh: 2 } }),
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
    );
    await expectRuntimeError(
      () =>
        runtime.load(cloneFixture(), {
          limits: { maxMeshes: Number.NaN },
        }),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
  });

  it("validates and clamps portable evaluator initial parameters", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    const clamped = runtime.load(cloneFixture(), {
      initialParameters: {
        "vivi.head.yaw": 2,
        "missing.parameter": 10,
      },
    });
    expect(clamped.getParameterValue("vivi.head.yaw")).toBe(1);
    expect(clamped.getParameterValue("missing.parameter")).toBeNull();

    await expectRuntimeError(
      () =>
        runtime.load(cloneFixture(), {
          initialParameters: { "vivi.head.yaw": Number.POSITIVE_INFINITY },
        }),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
  });

  it("normalizes native backend option serialization failures", async () => {
    const runtime = await createViviWasmRuntime({ backend: "native" });
    const cyclicOptions: Record<string, unknown> = {};
    cyclicOptions.self = cyclicOptions;

    await expectRuntimeError(
      () => runtime.load(cloneFixture(), cyclicOptions as RuntimeOptions),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
  });

  it("property-tests update and snapshot entry points with finite outputs", async () => {
    const runtime = await createViviWasmRuntime();
    const model = runtime.load(cloneFixture());
    const random = createPrng(0x76543210);

    for (let step = 0; step < 96; step += 1) {
      const input = random() * 4 - 2;
      const deltaSeconds = random() * 0.5;
      model.setInput("vivi.head.yaw", input);
      model.update(deltaSeconds);

      const renderList = model.getRenderList();
      expect(renderList).toHaveLength(1);
      const [mesh] = renderList;
      expect(mesh!.vertices.length).toBe(6);
      for (const value of mesh!.vertices) {
        expect(Number.isFinite(value)).toBe(true);
      }
      for (const value of mesh!.uvs) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }

    await expectRuntimeError(
      () => model.setInput("vivi.head.yaw", Number.POSITIVE_INFINITY),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
    await expectRuntimeError(
      () => model.update(Number.NaN),
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
    );
  });
});
