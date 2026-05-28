import { bench, describe } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import {
  ViviRuntime,
  type RuntimeMeshSnapshot,
  type ViviFileData,
} from "@vivi2d/runtime";
import { createViviWasmRuntime, type ViviWasmRuntime } from "../index";

interface BenchmarkRuntimeModel {
  setInput(id: string, value: number): void;
  update(deltaSeconds: number): void;
  getRenderList(): readonly RuntimeMeshSnapshot[];
}

function cloneFixture(name: string): ViviFileData {
  return JSON.parse(
    JSON.stringify(readRuntimeConformanceFixture(name).fileData),
  ) as ViviFileData;
}

function createReferenceModel(name: string): BenchmarkRuntimeModel {
  return ViviRuntime.load(cloneFixture(name));
}

function createWasmModel(
  runtime: ViviWasmRuntime,
  name: string,
): BenchmarkRuntimeModel {
  return runtime.load(cloneFixture(name));
}

const wasmRuntime = await createViviWasmRuntime();
const referenceBindingModel = createReferenceModel("binding-skinning");
const wasmBindingModel = createWasmModel(wasmRuntime, "binding-skinning");
const referencePhysicsModel = createReferenceModel("physics-pendulum");
const wasmPhysicsModel = createWasmModel(wasmRuntime, "physics-pendulum");

describe("runtime update and snapshot transfer", () => {
  bench("reference runtime: binding/skinning update", () => {
    referenceBindingModel.setInput("vivi.head.yaw", 0.5);
    referenceBindingModel.update(1 / 60);
  });

  bench("runtime-wasm portable: binding/skinning update", () => {
    wasmBindingModel.setInput("vivi.head.yaw", 0.5);
    wasmBindingModel.update(1 / 60);
  });

  bench("reference runtime: physics update", () => {
    referencePhysicsModel.setInput("vivi.head.yaw", 0.25);
    referencePhysicsModel.update(1 / 60);
  });

  bench("runtime-wasm portable: physics update", () => {
    wasmPhysicsModel.setInput("vivi.head.yaw", 0.25);
    wasmPhysicsModel.update(1 / 60);
  });

  bench("reference runtime: render-list buffer copy", () => {
    for (const snapshot of referenceBindingModel.getRenderList()) {
      new Float32Array(snapshot.vertices);
      new Float32Array(snapshot.uvs);
      new Uint32Array(snapshot.indices);
    }
  });

  bench("runtime-wasm portable: render-list buffer copy", () => {
    for (const snapshot of wasmBindingModel.getRenderList()) {
      new Float32Array(snapshot.vertices);
      new Float32Array(snapshot.uvs);
      new Uint32Array(snapshot.indices);
    }
  });
});
