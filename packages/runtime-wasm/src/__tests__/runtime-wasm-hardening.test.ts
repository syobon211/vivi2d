import { afterEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import {
  VIVI_RUNTIME_ERROR_CODES,
  ViviRuntimeError,
  createViviWasmRuntime,
  type ViviWasmRuntime,
} from "@vivi2d/runtime-wasm";
import { computeRuntimeMeshStates } from "../kernel/mesh";

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

function skinnedFixture(scaleX = 1): RuntimePayload {
  const fileData = cloneFixture();
  const mesh = fileData.project.layers.find((layer) => layer.kind === "viviMesh");
  if (mesh?.kind !== "viviMesh") throw new Error("fixture mesh missing");
  mesh.mesh = {
    vertices: [0, 0, 10, 0, 0, 10],
    uvs: [0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
    divisionsX: 1,
    divisionsY: 1,
  };
  fileData.project.layers.push({
    id: "runtime-bone",
    name: "Bone",
    kind: "bone",
    children: [],
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    blendMode: "normal",
    expanded: true,
    bone: { angle: 0, length: 10, scaleX, scaleY: 1 },
  });
  fileData.project.skins = {
    [mesh.id]: {
      weights: Array.from({ length: 3 }, () => [{ boneId: "runtime-bone", weight: 1 }]),
      bindPoseInverse: { "runtime-bone": [1, 0, 0, 1, 0, 0] },
    },
  };
  return fileData;
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
  it.each(["load", "parse"] as const)(
    "accepts an omitted optional skins map through portable %s",
    async (mode) => {
      const runtime = await createViviWasmRuntime({ backend: "portable" });
      const data = cloneFixture();
      Reflect.deleteProperty(data.project, "skins");
      expect(data.project).not.toHaveProperty("skins");
      const model =
        mode === "load" ? runtime.load(data) : runtime.parse(JSON.stringify(data));
      try {
        expect(model.getRenderList()).toHaveLength(1);
        expect(Array.from(model.getRenderList()[0]!.vertices)).toEqual([
          0, 0, 10, 0, 0, 10,
        ]);
        model.update(0);
        expect(Array.from(model.getRenderList()[0]!.vertices)).toEqual([
          0, 0, 10, 0, 0, 10,
        ]);
      } finally {
        model.dispose();
      }
    },
  );

  it.each(["load", "parse"] as const)(
    "normalizes unexpected portable constructor errors through %s",
    async (mode) => {
      const runtime = await createViviWasmRuntime({ backend: "portable" });
      const data = cloneFixture();
      const injected = new Error("test constructor failure");
      // Host-options fault injection, not a claim about ordinary JSON input.
      const options: RuntimeOptions = {
        get initialParameters(): Record<string, number> {
          throw injected;
        },
      };
      const error = await expectRuntimeError(
        () =>
          mode === "load"
            ? runtime.load(data, options)
            : runtime.parse(JSON.stringify(data), options),
        VIVI_RUNTIME_ERROR_CODES.validation,
      );
      expect(error.message).toBe("invalid runtime model data");
      expect(error.cause).toBe(injected);
    },
  );

  it("rejects derived binary32 overflow during portable load and parse", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    for (const scaleX of [1e100, 3e38]) {
      await expectRuntimeError(
        () => runtime.load(skinnedFixture(scaleX)),
        VIVI_RUNTIME_ERROR_CODES.validation,
      );
      await expectRuntimeError(
        () => runtime.parse(JSON.stringify(skinnedFixture(scaleX))),
        VIVI_RUNTIME_ERROR_CODES.validation,
      );
    }
  });

  it("preserves ordinary portable skinned geometry", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    const model = runtime.parse(JSON.stringify(skinnedFixture()));
    try {
      expect(Array.from(model.getRenderList()[0]!.vertices)).toEqual([
        0, 0, 10, 0, 0, 10,
      ]);
    } finally {
      model.dispose();
    }
  });

  it("rolls back portable derived overflow on update and can recover", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    const data = skinnedFixture();
    data.project.parameters = [
      { id: "runtime.scale", name: "Scale", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    data.project.parameterBindings = [
      {
        id: "scale-binding",
        parameterId: "runtime.scale",
        target: { type: "bone", boneId: "runtime-bone", property: "scaleX" },
        bindingPoints: [
          { paramValue: 0, targetValue: 1 },
          { paramValue: 1, targetValue: 1e100 },
        ],
      },
    ];
    const model = runtime.load(data);
    try {
      const before = model.getRenderList();
      expect(
        before.every((mesh) => Array.from(mesh.vertices).every(Number.isFinite)),
      ).toBe(true);
      model.setInput("runtime.scale", 1);
      await expectRuntimeError(
        () => model.update(0),
        VIVI_RUNTIME_ERROR_CODES.evaluation,
      );
      expect(model.getRenderList()).toEqual(before);
      model.setInput("runtime.scale", 0);
      model.update(0);
      expect(model.getRenderList()).toEqual(before);
    } finally {
      model.dispose();
    }
  });

  it("preflights every derived coordinate before writing aliased portable state", async () => {
    const data = skinnedFixture();
    const mesh = data.project.layers.find((layer) => layer.kind === "viviMesh");
    if (mesh?.kind !== "viviMesh") throw new Error("fixture mesh missing");
    const scratch = new Float32Array(mesh.mesh.vertices.length);
    const context: Parameters<typeof computeRuntimeMeshStates>[0] = {
      project: data.project,
      allLayers: data.project.layers,
      meshStaticCache: new Map(),
      meshScratchVerts: new Map([[mesh.id, scratch]]),
      meshStates: new Map(),
      drawOrderScratch: [],
      drawOrderCache: [],
      worldTransforms: new Map([["runtime-bone", [1, 0, 0, 1, 0, 0]]]),
    };
    computeRuntimeMeshStates(context);
    const state = context.meshStates.get(mesh.id)!;
    const before = Array.from(scratch);
    expect(state.vertices).toBe(scratch);
    // The first coordinate would change before a later coordinate overflows.
    context.worldTransforms.set("runtime-bone", [1e100, 0, 0, 1, 5, 0]);
    await expectRuntimeError(
      () => computeRuntimeMeshStates(context),
      VIVI_RUNTIME_ERROR_CODES.validation,
    );
    expect(context.meshScratchVerts.get(mesh.id)).toBe(scratch);
    expect(Array.from(scratch)).toEqual(before);
    expect(Array.from(state.vertices)).toEqual(before);
  });

  it("rejects invalid mesh buffers consistently in portable and native backends", async () => {
    for (const backend of ["portable", "native"] as const) {
      const runtime = await createViviWasmRuntime({ backend });
      for (const geometry of [
        { vertices: [0, 0, 1] },
        { uvs: [0, 0] },
        { vertices: [1e100, 0, 10, 0, 0, 10] },
        { uvs: [1e100, 0, 1, 0, 0, 1] },
        { indices: [0, 1] },
        { indices: [0, 1, 999] },
        { indices: [-1, 1, 2] },
        { indices: [0.5, 1, 2] },
      ]) {
        const payload = cloneFixture();
        const mesh = payload.project.layers.find((layer) => layer.kind === "viviMesh")!;
        if (mesh.kind !== "viviMesh") throw new Error("fixture mesh missing");
        Object.assign(mesh.mesh, geometry);
        let failure: unknown;
        try { runtime.load(payload); } catch (error) { failure = error; }
        expect(failure, `${backend}: ${JSON.stringify(geometry)}`).toBeInstanceOf(ViviRuntimeError);
        expect((failure as ViviRuntimeError).code).toBe(VIVI_RUNTIME_ERROR_CODES.validation);
      }
    }
  });
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

  it("rejects malformed numeric data in portable load and parse", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });
    const mutations: Array<(data: RuntimePayload) => void> = [
      (data) => { data.atlases[0]!.width = -16; },
      (data) => { data.project.width = -64; },
      (data) => {
        const layer = data.project.layers[0]!;
        if (layer.kind === "viviMesh") layer.mesh.vertices[0] = Number.NaN;
      },
      (data) => {
        const layer = data.project.layers[0]!;
        if (layer.kind === "viviMesh") {
          layer.mesh.vertices[0] = "not-a-number" as unknown as number;
        }
      },
    ];
    for (const mutate of mutations) {
      const data = cloneFixture();
      mutate(data);
      await expectRuntimeError(
        () => runtime.load(data),
        VIVI_RUNTIME_ERROR_CODES.validation,
      );
      await expectRuntimeError(
        () => runtime.parse(JSON.stringify(data)),
        VIVI_RUNTIME_ERROR_CODES.validation,
      );
    }
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

  it("rejects attempts to override fixed mask depth in the portable evaluator", async () => {
    const runtime = await createViviWasmRuntime({ backend: "portable" });

    for (const maxMaskDepth of [4, undefined]) {
      const escapedOptions = {
        limits: { maxMaskDepth },
      } as unknown as RuntimeOptions;

      await expectRuntimeError(
        () => runtime.load(cloneFixture(), escapedOptions),
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
      );
    }
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
