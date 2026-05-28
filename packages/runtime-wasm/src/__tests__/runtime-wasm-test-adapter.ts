import { expect, it } from "vitest";
import {
  readRuntimeConformanceFixtures,
  runRuntimeConformanceErrorFixture,
  runRuntimeConformanceFixture,
  type RuntimeConformanceAdapter,
} from "../../../../tests/conformance/runtime-v1/runner";
import { createVitestRuntimeConformanceExpect } from "../../../../tests/conformance/runtime-v1/vitest-expect";
import {
  VIVI_RUNTIME_TOLERANCES,
  type ViviWasmRuntime,
  type WasmRuntimeModel,
} from "@vivi2d/runtime-wasm";

const vitestExpect = createVitestRuntimeConformanceExpect(expect);

export function createWasmRuntimeConformanceAdapter(
  getRuntime: () => ViviWasmRuntime,
): RuntimeConformanceAdapter<WasmRuntimeModel> {
  return {
    load(fileData, runtimeOptions) {
      const runtime = getRuntime();
      return runtime.load(
        fileData as unknown as Parameters<typeof runtime.load>[0],
        runtimeOptions as Parameters<typeof runtime.load>[1],
      );
    },
    setInput(model, id, value) {
      model.setInput(id, value);
    },
    applyExpressionPreset(model, id) {
      model.applyExpressionPreset(id);
    },
    update(model, deltaSeconds) {
      model.update(deltaSeconds);
    },
    getParameterValue(model, id) {
      return model.getParameterValue(id);
    },
    getTextures(model) {
      return [...model.getTextures()];
    },
    getRenderList(model) {
      return [...model.getRenderList()];
    },
    hitTest(model, x, y) {
      return model.hitTest(x, y);
    },
  };
}

export function runWasmRuntimeConformanceCases(
  adapter: RuntimeConformanceAdapter<WasmRuntimeModel>,
): void {
  const fixtures = readRuntimeConformanceFixtures();
  const successFixtures = fixtures.filter((fixture) => fixture.expect !== undefined);
  const errorFixtures = fixtures.filter((fixture) => fixture.expectError !== undefined);

  it.each(successFixtures.map((fixture) => [fixture.name, fixture] as const))(
    "matches fixture %s",
    (_fixtureName, fixture) => {
      runRuntimeConformanceFixture(
        adapter,
        fixture,
        vitestExpect,
        VIVI_RUNTIME_TOLERANCES,
      );
    },
  );

  it.each(errorFixtures.map((fixture) => [fixture.name, fixture] as const))(
    "rejects fixture %s",
    (_fixtureName, fixture) => {
      expect(fixture.expectError).toBeDefined();
      runRuntimeConformanceErrorFixture(adapter, fixture, vitestExpect);
    },
  );
}
