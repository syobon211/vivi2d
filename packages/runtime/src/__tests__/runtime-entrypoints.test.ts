import {
  VIVI_BLEND_MODE as CORE_BLEND_MODE,
  VIVI_RUNTIME_ERROR_CODES as CORE_RUNTIME_ERROR_CODES,
  ViviRuntimeError as CoreRuntimeError,
} from "@vivi2d/core";
import { ViviRuntimeError as ModelRuntimeError } from "@vivi2d/model/runtime-spec";
import {
  VIVI_BLEND_MODE,
  VIVI_RUNTIME_ABI_VERSION,
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_LIMITS,
  VIVI_RUNTIME_PROJECT_FILE_VERSION,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  VIVI_RUNTIME_SPEC_VERSION,
  VIVI_RUNTIME_TIMING,
  VIVI_RUNTIME_TOLERANCES,
  ViviRuntimeError,
} from "@vivi2d/runtime";
import { describe, expect, it } from "vitest";

describe("@vivi2d/runtime entrypoints", () => {
  it("keeps runtime spec exports defined after splitting their source package", () => {
    expect(VIVI_BLEND_MODE.normal).toBe(0);
    expect(VIVI_RUNTIME_ABI_VERSION).toBeGreaterThan(0);
    expect(VIVI_RUNTIME_ERROR_CODES.invalidArgument).toBe("VIVI_ERR_INVALID_ARGUMENT");
    expect(VIVI_RUNTIME_LIMITS.maxMeshes).toBeGreaterThan(0);
    expect(VIVI_RUNTIME_PROJECT_FILE_VERSION).toBe(10);
    expect(VIVI_RUNTIME_SPEC_V1_VERSION.major).toBe(1);
    expect(VIVI_RUNTIME_SPEC_VERSION.major).toBe(1);
    expect(VIVI_RUNTIME_TIMING.maxDeltaSeconds).toBeGreaterThan(0);
    expect(VIVI_RUNTIME_TOLERANCES.vertexPosition).toBeGreaterThan(0);
  });

  it("preserves runtime error and constant identity across facade packages", () => {
    expect(ViviRuntimeError).toBe(ModelRuntimeError);
    expect(CoreRuntimeError).toBe(ModelRuntimeError);
    expect(VIVI_BLEND_MODE).toBe(CORE_BLEND_MODE);
    expect(VIVI_RUNTIME_ERROR_CODES).toBe(CORE_RUNTIME_ERROR_CODES);

    const error = new CoreRuntimeError(
      CORE_RUNTIME_ERROR_CODES.invalidArgument,
      "invalid",
    );

    expect(error).toBeInstanceOf(ViviRuntimeError);
  });
});
