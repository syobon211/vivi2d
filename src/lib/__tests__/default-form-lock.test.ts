import { isDefaultFormActive } from "@vivi2d/core/default-form-lock";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("isDefaultFormActive", () => {
  const makeParam = (id: string, defaultValue: number): ParameterDefinition => ({
    id,
    name: id,
    minValue: -1,
    maxValue: 1,
    defaultValue,
  });

  it("パラメータが空の場合は true", () => {
    expect(isDefaultFormActive([], {})).toBe(true);
  });

  it("全パラメータがデフォルト値の場合は true", () => {
    const params = [makeParam("a", 0), makeParam("b", 0.5)];
    const values = { a: 0, b: 0.5 };
    expect(isDefaultFormActive(params, values)).toBe(true);
  });

  it("1つでもデフォルト値でなければ false", () => {
    const params = [makeParam("a", 0), makeParam("b", 0.5)];
    const values = { a: 0, b: 0.3 };
    expect(isDefaultFormActive(params, values)).toBe(false);
  });

  it("値が未設定のパラメータは無視する", () => {
    const params = [makeParam("a", 0), makeParam("b", 0.5)];
    const values = { a: 0 };
    expect(isDefaultFormActive(params, values)).toBe(true);
  });

  it("浮動小数点の微小誤差は許容する", () => {
    const params = [makeParam("a", 0.3)];
    const values = { a: 0.1 + 0.2 }; // 0.30000000000000004
    expect(isDefaultFormActive(params, values)).toBe(true);
  });

  it("有意な差は検出する", () => {
    const params = [makeParam("a", 0)];
    const values = { a: 0.001 };
    expect(isDefaultFormActive(params, values)).toBe(false);
  });

  it("parameterValues に余分なキーがあっても無視される", () => {
    const params = [makeParam("a", 0)];
    const values = { a: 0, extra: 999, unknown: -42 };
    expect(isDefaultFormActive(params, values)).toBe(true);
  });
});
