import { expectTypeOf } from "vitest";
import type { RuntimeLimitOverrides } from "../index";

expectTypeOf<RuntimeLimitOverrides>().not.toHaveProperty("maxMaskDepth");
expectTypeOf<RuntimeLimitOverrides>()
  .toHaveProperty("maxMeshes")
  .toEqualTypeOf<number | undefined>();
