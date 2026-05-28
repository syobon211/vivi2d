import { beforeAll, describe, expect, it } from "vitest";
import {
  VIVI_RUNTIME_ABI_VERSION,
  VIVI_RUNTIME_ERROR_CODES,
  ViviRuntimeError,
  createViviWasmRuntime,
  type ViviWasmRuntime,
} from "@vivi2d/runtime-wasm";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import {
  createWasmRuntimeConformanceAdapter,
  runWasmRuntimeConformanceCases,
} from "./runtime-wasm-test-adapter";

let wasmRuntime: ViviWasmRuntime;

function getWasmRuntime(): ViviWasmRuntime {
  return wasmRuntime;
}

function cloneFixture(name = "basic-mesh") {
  return JSON.parse(
    JSON.stringify(readRuntimeConformanceFixture(name).fileData),
  );
}

const adapter = createWasmRuntimeConformanceAdapter(getWasmRuntime);

describe("@vivi2d/runtime-wasm native backend", () => {
  beforeAll(async () => {
    wasmRuntime = await createViviWasmRuntime({ backend: "native" });
  });

  it("initializes the embedded native WASM module", () => {
    expect(wasmRuntime.getBackendInfo()).toEqual({
      kind: "wasm-runtime",
      abiVersion: VIVI_RUNTIME_ABI_VERSION,
      backendPreference: "native",
      selectedBackend: "native",
      nativeAvailable: true,
      evaluator: "native-rust",
      wasmModuleValidated: true,
      fallbackReason: null,
    });
  });

  it("uses native WASM by default when available", async () => {
    const runtime = await createViviWasmRuntime();
    expect(runtime.getBackendInfo()).toMatchObject({
      backendPreference: "auto",
      selectedBackend: "native",
      nativeAvailable: true,
      evaluator: "native-rust",
    });
  });

  it("rejects ABI mismatches with a canonical internal error", async () => {
    let caught: unknown;
    try {
      await createViviWasmRuntime({
        backend: "native",
        expectedAbiVersion: VIVI_RUNTIME_ABI_VERSION + 1,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ViviRuntimeError);
    expect((caught as ViviRuntimeError).code).toBe(
      VIVI_RUNTIME_ERROR_CODES.internal,
    );
  });

  it("does not expose mutable internal color arrays in mesh snapshots", () => {
    const payload = cloneFixture();
    const layer = payload.project.layers[0]!;
    layer.multiplyColor = { r: 0.25, g: 0.5, b: 0.75 };
    layer.screenColor = { r: 0.1, g: 0.2, b: 0.3 };

    const model = wasmRuntime.load(payload);
    const mesh = model.getRenderList()[0]!;

    expect(mesh.multiplyColor?.[0]).toBeCloseTo(0.25);
    expect(mesh.screenColor?.[2]).toBeCloseTo(0.3);
    expect(Object.isFrozen(mesh.multiplyColor)).toBe(true);
    expect(Object.isFrozen(mesh.screenColor)).toBe(true);
  });

  runWasmRuntimeConformanceCases(adapter);
});
