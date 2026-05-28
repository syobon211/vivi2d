import { describe, expect, it } from "vitest";
import {
  assertDefined,
  assertNonNull,
  isDefined,
  isNotNullish,
  requireDefined,
  requireIndex,
} from "../type-guards";

describe("type-guards", () => {
  describe("assertDefined", () => {
    it("定義済みの値は例外を投げない", () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined("")).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
      expect(() => assertDefined({ a: 1 })).not.toThrow();
    });

    it("null で例外", () => {
      expect(() => assertDefined(null)).toThrow();
    });

    it("undefined で例外", () => {
      expect(() => assertDefined(undefined)).toThrow();
    });

    it("カスタムメッセージを使える", () => {
      expect(() => assertDefined(null, "カスタム")).toThrow("カスタム");
    });
  });

  describe("requireDefined", () => {
    it("定義済みの値をそのまま返す", () => {
      expect(requireDefined(42)).toBe(42);
      expect(requireDefined("x")).toBe("x");
    });

    it("null で例外", () => {
      expect(() => requireDefined(null)).toThrow();
    });

    it("undefined で例外", () => {
      expect(() => requireDefined(undefined)).toThrow();
    });
  });

  describe("requireIndex", () => {
    it("範囲内のインデックスは値を返す", () => {
      expect(requireIndex([1, 2, 3], 0)).toBe(1);
      expect(requireIndex([1, 2, 3], 2)).toBe(3);
    });

    it("範囲外で例外", () => {
      expect(() => requireIndex([1, 2, 3], 5)).toThrow();
      expect(() => requireIndex([], 0)).toThrow();
    });
  });

  describe("assertNonNull", () => {
    it("null 以外は例外を投げない", () => {
      expect(() => assertNonNull(0)).not.toThrow();
      expect(() => assertNonNull(undefined)).not.toThrow();
    });

    it("null で例外", () => {
      expect(() => assertNonNull(null)).toThrow();
    });
  });

  describe("isDefined", () => {
    it("undefined で false", () => {
      expect(isDefined(undefined)).toBe(false);
    });

    it("それ以外で true（null含む）", () => {
      expect(isDefined(null)).toBe(true);
      expect(isDefined(0)).toBe(true);
      expect(isDefined("")).toBe(true);
      expect(isDefined(false)).toBe(true);
    });
  });

  describe("isNotNullish", () => {
    it("null/undefined で false", () => {
      expect(isNotNullish(null)).toBe(false);
      expect(isNotNullish(undefined)).toBe(false);
    });

    it("それ以外で true", () => {
      expect(isNotNullish(0)).toBe(true);
      expect(isNotNullish("")).toBe(true);
      expect(isNotNullish(false)).toBe(true);
    });
  });
});
