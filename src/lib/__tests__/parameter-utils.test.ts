import { mergeParameterDefaults } from "@vivi2d/core/parameter-utils";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

function createParamDef(
  overrides: Partial<ParameterDefinition> & Pick<ParameterDefinition, "id">,
): ParameterDefinition {
  return {
    name: overrides.id,
    minValue: 0,
    maxValue: 1,
    defaultValue: 0.5,
    ...overrides,
  };
}

describe("mergeParameterDefaults", () => {
  it("パラメータが空の場合、オーバーライドのみ返す", () => {
    const result = mergeParameterDefaults([], { extra: 42 });
    expect(result).toEqual({ extra: 42 });
  });

  it("オーバーライドが空の場合、全パラメータのデフォルト値を返す", () => {
    const params = [
      createParamDef({ id: "p1", defaultValue: 0.3 }),
      createParamDef({ id: "p2", defaultValue: 0.7 }),
    ];

    const result = mergeParameterDefaults(params, {});
    expect(result).toEqual({ p1: 0.3, p2: 0.7 });
  });

  it("既知値の上書きと未指定default、未知キーを同時に保持する", () => {
    const params = [
      createParamDef({ id: "a", defaultValue: 0.1 }),
      createParamDef({ id: "b", defaultValue: 0.2 }),
      createParamDef({ id: "c", defaultValue: 0.3 }),
    ];
    expect(mergeParameterDefaults(params, { a: 1, b: 0, unknown: 0.7 })).toEqual({
      a: 1,
      b: 0,
      c: 0.3,
      unknown: 0.7,
    });
  });

  it("readonlyな入力を破壊しない", () => {
    const params: readonly ParameterDefinition[] = Object.freeze([
      createParamDef({ id: "p1", defaultValue: 0.5 }),
    ]);
    const overrides: Readonly<Record<string, number>> = Object.freeze({ p1: 0.9 });

    const result = mergeParameterDefaults(params, overrides);
    expect(result).toEqual({ p1: 0.9 });
    expect(overrides).toEqual({ p1: 0.9 });
  });
});
