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

  it("オーバーライドがデフォルト値を上書きする", () => {
    const params = [
      createParamDef({ id: "p1", defaultValue: 0.5 }),
      createParamDef({ id: "p2", defaultValue: 0.5 }),
    ];

    const result = mergeParameterDefaults(params, { p1: 1.0 });
    expect(result).toEqual({ p1: 1.0, p2: 0.5 });
  });

  it("オーバーライドにパラメータ定義にないキーがあっても含まれる", () => {
    const params = [createParamDef({ id: "p1", defaultValue: 0.5 })];

    const result = mergeParameterDefaults(params, { p1: 0.8, unknown: 0.3 });
    expect(result).toEqual({ p1: 0.8, unknown: 0.3 });
  });

  it("全パラメータがオーバーライドされる場合", () => {
    const params = [
      createParamDef({ id: "a", defaultValue: 0 }),
      createParamDef({ id: "b", defaultValue: 0 }),
    ];

    const result = mergeParameterDefaults(params, { a: 1.0, b: 1.0 });
    expect(result).toEqual({ a: 1.0, b: 1.0 });
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

  it("大量のパラメータでも正しくマージされる", () => {
    const params = Array.from({ length: 100 }, (_, i) =>
      createParamDef({ id: `param-${i}`, defaultValue: i / 100 }),
    );
    const overrides: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      overrides[`param-${i}`] = 1.0;
    }

    const result = mergeParameterDefaults(params, overrides);
    expect(Object.keys(result)).toHaveLength(100);
    expect(result["param-0"]).toBe(1.0);
    expect(result["param-50"]).toBe(0.5);
    expect(result["param-99"]).toBe(0.99);
  });
});
