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

describe("@vivi2d/runtime-wasm portable evaluator", () => {
  beforeAll(async () => {
    wasmRuntime = await createViviWasmRuntime({ backend: "portable" });
  });

  it("can force the portable evaluator without initializing the native backend", () => {
    expect(wasmRuntime.getBackendInfo()).toEqual({
      kind: "wasm-runtime",
      abiVersion: VIVI_RUNTIME_ABI_VERSION,
      backendPreference: "portable",
      selectedBackend: "portable",
      nativeAvailable: false,
      evaluator: "portable-typescript",
      wasmModuleValidated: false,
      fallbackReason: null,
    });
  });

  it("can force the native backend", async () => {
    const portable = await createViviWasmRuntime({ backend: "portable" });
    expect(portable.getBackendInfo()).toMatchObject({
      backendPreference: "portable",
      selectedBackend: "portable",
      fallbackReason: null,
    });

    const native = await createViviWasmRuntime({ backend: "native" });
    expect(native.getBackendInfo()).toMatchObject({
      backendPreference: "native",
      selectedBackend: "native",
      nativeAvailable: true,
      evaluator: "native-rust",
      wasmModuleValidated: true,
      fallbackReason: null,
    });
  });

  it("exposes the current facade surface without the reference runtime bridge", () => {
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
    expect(model.getTextureData("missing")).toBeNull();
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
    expect(() => model.setInput("missing", 0)).toThrow(ViviRuntimeError);
    expect(() => model.setInput("vivi.head.yaw", Number.NaN)).toThrow(
      ViviRuntimeError,
    );
    expect(() => model.update(-1)).toThrow(ViviRuntimeError);

    const parsed = wasmRuntime.parse(JSON.stringify(fixture.fileData));
    expect(parsed.getRenderList()).toHaveLength(1);
    parsed.dispose();
    expect(() => parsed.getRenderList()).toThrow(ViviRuntimeError);
  });

  it("normalizes malformed direct object loads to canonical errors", () => {
    let caught: unknown;
    try {
      wasmRuntime.load({
        version: 10,
        profile: "publicProfileV1",
      } as unknown as Parameters<typeof wasmRuntime.load>[0]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ViviRuntimeError);
    expect((caught as ViviRuntimeError).code).toBe(
      VIVI_RUNTIME_ERROR_CODES.validation,
    );
  });

  it("normalizes malformed JSON parses to parse errors", () => {
    let caught: unknown;
    try {
      wasmRuntime.parse("{");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ViviRuntimeError);
    expect((caught as ViviRuntimeError).code).toBe(VIVI_RUNTIME_ERROR_CODES.parse);
  });

  it("ignores unknown parameters inside expression presets", () => {
    const fixture = readRuntimeConformanceFixture("basic-mesh");
    const fileData = JSON.parse(JSON.stringify(fixture.fileData)) as Parameters<
      typeof wasmRuntime.load
    >[0];
    fileData.project.expressionPresets![0]!.values["missing.parameter"] = 1;
    const model = wasmRuntime.load(fileData);

    expect(() => model.applyExpressionPreset("neutral")).not.toThrow();
    expect(model.getParameterValue("vivi.head.yaw")).toBe(0.25);
  });

  runWasmRuntimeConformanceCases(adapter);
});
