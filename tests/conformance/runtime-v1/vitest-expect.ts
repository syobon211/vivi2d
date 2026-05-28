import type { RuntimeConformanceExpect } from "./runner";

interface VitestExpectLike {
  (actual: unknown): {
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: object): void;
    toBeNull(): void;
    toBeLessThanOrEqual(expected: number): void;
  };
}

export function createVitestRuntimeConformanceExpect(
  expect: VitestExpectLike,
): RuntimeConformanceExpect {
  return {
    toEqual(actual, expected) {
      expect(actual).toEqual(expected);
    },
    toHaveLength(actual, expected) {
      expect(actual).toHaveLength(expected);
    },
    toMatchObject(actual, expected) {
      expect(actual as object).toMatchObject(expected as object);
    },
    toBeNull(actual) {
      expect(actual).toBeNull();
    },
    toBeWithinTolerance(actual, expected, tolerance) {
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
    },
  };
}
