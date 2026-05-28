export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined, got null/undefined");
  }
}

export function requireDefined<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined, got null/undefined");
  }
  return value;
}

export function requireIndex<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`Array index ${index} out of bounds (length=${arr.length})`);
  }
  return value;
}

export function assertNonNull<T>(value: T | null, message?: string): asserts value is T {
  if (value === null) {
    throw new Error(message ?? "Expected value to be non-null, got null");
  }
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
