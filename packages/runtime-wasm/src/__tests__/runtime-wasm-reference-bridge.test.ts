import { beforeAll, describe, expect, it } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import {
  VIVI_RUNTIME_ABI_VERSION,
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  ViviRuntimeError,
  createViviWasmRuntime,
  type ViviWasmRuntime,
} from "@vivi2d/runtime-wasm";
import {
  createWasmRuntimeConformanceAdapter,
  runWasmRuntimeConformanceCases,
} from "./runtime-wasm-test-adapter";

let wasmRuntime: ViviWasmRuntime;

function getWasmRuntime(): ViviWasmRuntime {
  return wasmRuntime;
}

const adapter = createWasmRuntimeConformanceAdapter(getWasmRuntime);

describe("@vivi2d/runtime-wasm reference bridge", () => {
  beforeAll(async () => {
    wasmRuntime = await createViviWasmRuntime({
      backend: "portable",
      evaluator: "reference",
    });
  });

  it("reports honest backend metadata for the reference bridge", () => {
    expect(wasmRuntime.getBackendInfo()).toEqual({
      kind: "wasm-runtime",
      abiVersion: VIVI_RUNTIME_ABI_VERSION,
      backendPreference: "portable",
      selectedBackend: "portable",
      nativeAvailable: false,
      evaluator: "typescript-reference",
      wasmModuleValidated: false,
      fallbackReason: null,
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

  it("delegates the full current facade surface through the reference bridge", () => {
    const fixture = readRuntimeConformanceFixture("basic-mesh");
    const model = wasmRuntime.load(
      fixture.fileData as unknown as Parameters<typeof wasmRuntime.load>[0],
    );

    expect(model.getSpecVersion()).toEqual(VIVI_RUNTIME_SPEC_V1_VERSION);
    expect(model.getSupportedSpecVersionRange()).toEqual({
      min: VIVI_RUNTIME_SPEC_V1_VERSION,
      max: model.getRuntimeVersion(),
    });
    expect(model.width).toBe(64);
    expect(model.height).toBe(64);
    expect(model.getParameters()).toHaveLength(1);
    expect(model.getTextureData("atlas:0")).toMatchObject({
      hostImageId: "host-atlas-0",
    });
    expect(model.getExpressionPresets()).toHaveLength(1);
    expect(model.getMeshSnapshot("mesh-body")).toMatchObject({
      id: "mesh-body",
      textureId: "atlas:0",
    });
    expect(model.getMeshSnapshot("missing")).toBeNull();
    expect(model.getPlaybackState()).toEqual({
      playing: false,
      clipId: null,
      timeSeconds: 0,
      loop: false,
    });
    expect(model.getStateMachineState("missing")).toBeNull();

    expect(() => model.playClip("missing")).toThrow(ViviRuntimeError);
    expect(() => model.stopClip()).toThrow(ViviRuntimeError);
    expect(() => model.seekClip(0)).toThrow(ViviRuntimeError);
    expect(() => model.setStateMachineState("machine", "state")).toThrow(
      ViviRuntimeError,
    );

    const parsed = wasmRuntime.parse(JSON.stringify(fixture.fileData));
    expect(parsed.getRenderList()).toHaveLength(1);
    parsed.dispose();
    expect(() => parsed.getRenderList()).toThrow(ViviRuntimeError);
  });

  runWasmRuntimeConformanceCases(adapter);
});
