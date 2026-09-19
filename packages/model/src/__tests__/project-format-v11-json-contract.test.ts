import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_VIVI_TEXT_FILE_BYTES } from "../load-limits";
import {
  canonicalizeJsonV11,
  PROJECT_FORMAT_V11_JSON_LIMITS,
  ProjectFormatV11JsonError,
  type ProjectFormatV11JsonErrorCode,
  parseJsonV11,
} from "../project-format-v11/json-contract";
import goldenFixture from "./fixtures/project-format-v11-golden.json";

interface JcsFixture {
  id: string;
  inputJson?: string;
  inputGenerator?: {
    kind: "nestedArrays";
    count: number;
    leaf: number;
  };
  expectedCanonical?: string;
  expectedCanonicalLength?: number;
  expectedUtf8Bytes?: number;
  expectedSha256?: string;
  expectedError?: ProjectFormatV11JsonErrorCode;
}

const fixture = goldenFixture as {
  jcs: JcsFixture[];
};
const productionFixturePath = path.join(
  process.cwd(),
  "packages/model/src/__tests__/fixtures/project-format-v11-golden.json",
);

function fixtureInput(vector: JcsFixture): string {
  if (vector.inputJson !== undefined) return vector.inputJson;
  if (vector.inputGenerator?.kind === "nestedArrays") {
    const { count, leaf } = vector.inputGenerator;
    return `${"[".repeat(count)}${leaf}${"]".repeat(count)}`;
  }
  throw new Error(`Fixture ${vector.id} has no supported input`);
}

function expectCode(action: () => unknown, code: ProjectFormatV11JsonErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFormatV11JsonError);
    expect((error as ProjectFormatV11JsonError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("Project Format v11 JSON contract fixtures", () => {
  it("shares the repository text byte ceiling", () => {
    expect(PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes).toBe(
      MAX_VIVI_TEXT_FILE_BYTES,
    );
  });

  it("pins the tracked production copy of the frozen oracle", () => {
    const bytes = readFileSync(productionFixturePath);
    expect(bytes.byteLength).toBe(8_220);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "dc3203f3eef2dd6c6e42e60f8b719e88dcf893066d60cc3fb8ced23705a505ac",
    );
  });

  for (const vector of fixture.jcs) {
    it(vector.id, () => {
      const input = fixtureInput(vector);
      if (vector.expectedError !== undefined) {
        expectCode(() => parseJsonV11(input), vector.expectedError);
        return;
      }

      const canonical = canonicalizeJsonV11(parseJsonV11(input));
      if (vector.expectedCanonical !== undefined) {
        expect(canonical).toBe(vector.expectedCanonical);
      }
      if (vector.expectedCanonicalLength !== undefined) {
        expect(canonical.length).toBe(vector.expectedCanonicalLength);
      }
      if (vector.expectedUtf8Bytes !== undefined) {
        expect(new TextEncoder().encode(canonical).byteLength).toBe(
          vector.expectedUtf8Bytes,
        );
      }
      if (vector.expectedSha256 !== undefined) {
        expect(createHash("sha256").update(canonical).digest("hex")).toBe(
          vector.expectedSha256,
        );
      }
    });
  }
});

describe("parseJsonV11 grammar and limits", () => {
  it("parses every JSON value form without prototype mutation", () => {
    const parsed = parseJsonV11(
      '{"z":[true,false,null,-12.5e+2,"line\\nfeed"],"__proto__":{"safe":true}}',
    ) as Record<string, unknown>;

    expect(parsed.z).toEqual([true, false, null, -1250, "line\nfeed"]);
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(({} as { safe?: boolean }).safe).toBeUndefined();
  });

  it.each([
    ["", "VIVI_FMT_INVALID_JSON"],
    ["\ufeff{}", "VIVI_FMT_INVALID_JSON"],
    ["01", "VIVI_FMT_INVALID_JSON"],
    ["1.", "VIVI_FMT_INVALID_JSON"],
    ["1e", "VIVI_FMT_INVALID_JSON"],
    ["[1,]", "VIVI_FMT_INVALID_JSON"],
    ['{"a":1,}', "VIVI_FMT_INVALID_JSON"],
    ["/* comment */ null", "VIVI_FMT_INVALID_JSON"],
    ["NaN", "VIVI_FMT_INVALID_JSON"],
    ['"bad\\xescape"', "VIVI_FMT_INVALID_JSON"],
    ["1e309", "VIVI_FMT_INT_PRECISION_LOSS"],
  ] as const)("rejects invalid grammar %#", (input, code) => {
    expectCode(() => parseJsonV11(input), code);
  });

  it("enforces a lowered input UTF-8 byte limit", () => {
    expectCode(
      () => parseJsonV11('"ab"', { testLimits: { maxInputUtf8Bytes: 3 } }),
      "VIVI_FMT_JSON_TOO_LARGE",
    );
  });

  it("counts punctuation and scalar lexical tokens", () => {
    expect(parseJsonV11("[0]", { testLimits: { maxTokens: 3 } })).toEqual([0]);
    expectCode(
      () => parseJsonV11("[0]", { testLimits: { maxTokens: 2 } }),
      "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
    );
  });

  it("applies the string limit after escape decoding and in UTF-8 bytes", () => {
    expect(
      parseJsonV11('"\\u00e9"', {
        testLimits: { maxDecodedStringUtf8Bytes: 2 },
      }),
    ).toBe("é");
    expectCode(
      () =>
        parseJsonV11('"\\u00e9"', {
          testLimits: { maxDecodedStringUtf8Bytes: 1 },
        }),
      "VIVI_FMT_STRING_TOO_LARGE",
    );
  });

  it("detects duplicate keys after JSON escape decoding", () => {
    expectCode(
      () => parseJsonV11('{"alpha":1,"\\u0061lpha":2}'),
      "VIVI_FMT_DUPLICATE_MAP_KEY",
    );
  });

  it("rejects escaped and raw lone surrogates but accepts a scalar pair", () => {
    expect(parseJsonV11('"\\ud83d\\ude00"')).toBe("😀");
    expectCode(() => parseJsonV11('"\\ud800"'), "VIVI_FMT_UNICODE_SCALAR_INVALID");
    const rawLoneSurrogate = `"${String.fromCharCode(0xdfff)}"`;
    expectCode(() => parseJsonV11(rawLoneSurrogate), "VIVI_FMT_UNICODE_SCALAR_INVALID");
  });

  it("rejects a lowered container depth boundary", () => {
    expect(parseJsonV11("[[0]]", { testLimits: { maxContainerDepth: 2 } })).toEqual([
      [0],
    ]);
    expectCode(
      () => parseJsonV11("[[0]]", { testLimits: { maxContainerDepth: 1 } }),
      "VIVI_FMT_DEPTH_EXCEEDED",
    );
  });
});

describe("canonicalizeJsonV11", () => {
  it("sorts object keys recursively and normalizes negative zero", () => {
    expect(canonicalizeJsonV11({ z: -0, a: { d: 2, c: 1 } })).toBe(
      '{"a":{"c":1,"d":2},"z":0}',
    );
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    9_007_199_254_740_992,
  ])("rejects non-contract number %s", (value) => {
    expectCode(() => canonicalizeJsonV11(value), "VIVI_FMT_INT_PRECISION_LOSS");
  });

  it("rejects cycles and accessors without invoking them", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expectCode(() => canonicalizeJsonV11(cyclic), "VIVI_FMT_INVALID_JSON");

    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    expectCode(() => canonicalizeJsonV11(accessor), "VIVI_FMT_INVALID_JSON");

    const arrayAccessor: unknown[] = [null];
    Object.defineProperty(arrayAccessor, "0", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    expectCode(() => canonicalizeJsonV11(arrayAccessor), "VIVI_FMT_INVALID_JSON");
  });

  it("rejects sparse arrays and extra array properties", () => {
    expectCode(() => canonicalizeJsonV11(new Array(1)), "VIVI_FMT_INVALID_JSON");

    const extraProperty = [0] as number[] & { metadata?: string };
    extraProperty.metadata = "not JSON array data";
    expectCode(() => canonicalizeJsonV11(extraProperty), "VIVI_FMT_INVALID_JSON");
  });

  it.each([
    [null, "null"],
    [true, "true"],
    [false, "false"],
    [-0, "0"],
    [-12.5, "-12.5"],
    [1e-7, "1e-7"],
    [Number.MIN_VALUE, "5e-324"],
    ["é水😀", '"é水😀"'],
    ['"\\\b\f\n\r\t\u0000\u001f/', '"\\"\\\\\\b\\f\\n\\r\\t\\u0000\\u001f/"'],
    [{ 'é"': ["水", null], a: {} }, '{"a":{},"é\\"":["水",null]}'],
    [[], "[]"],
    [{}, "{}"],
  ] as const)("accounts for exact canonical UTF-8 bytes %#", (value, canonical) => {
    const bytes = new TextEncoder().encode(canonical).byteLength;
    for (const maxInputUtf8Bytes of [bytes, bytes + 1]) {
      expect(canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes } })).toBe(
        canonical,
      );
    }
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: bytes - 1 } }),
      "VIVI_FMT_JSON_TOO_LARGE",
    );
  });

  it.each([
    [null, 1],
    [[], 2],
    [{}, 2],
    [[0], 3],
    [[0, true], 5],
    [{ a: null }, 5],
    [{ a: [0, 1], b: {} }, 14],
  ] as const)("matches parser punctuation and scalar token accounting %#", (value, tokens) => {
    const canonical = canonicalizeJsonV11(value);
    for (const maxTokens of [tokens, tokens + 1]) {
      expect(canonicalizeJsonV11(value, { testLimits: { maxTokens } })).toBe(canonical);
      expect(parseJsonV11(canonical, { testLimits: { maxTokens } })).toEqual(value);
    }
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxTokens: tokens - 1 } }),
      "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
    );
    expectCode(
      () => parseJsonV11(canonical, { testLimits: { maxTokens: tokens - 1 } }),
      "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
    );
  });

  it("bounds canonical output even when an accepted input number uses fewer bytes", () => {
    const value = parseJsonV11("1E5", { testLimits: { maxInputUtf8Bytes: 4 } });
    expect(value).toBe(100_000);
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: 4 } }),
      "VIVI_FMT_JSON_TOO_LARGE",
    );
    expect(canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: 6 } })).toBe(
      "100000",
    );
  });

  it.each([
    "é",
    { é: null },
  ])("bounds decoded strings and keys independently %#", (value) => {
    for (const maxDecodedStringUtf8Bytes of [2, 3]) {
      expect(
        canonicalizeJsonV11(value, { testLimits: { maxDecodedStringUtf8Bytes } }),
      ).toBe(canonicalizeJsonV11(value));
    }
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxDecodedStringUtf8Bytes: 1 } }),
      "VIVI_FMT_STRING_TOO_LARGE",
    );
  });

  it("applies the lower-only depth limit before nested output", () => {
    for (const maxContainerDepth of [2, 3]) {
      expect(canonicalizeJsonV11([[0]], { testLimits: { maxContainerDepth } })).toBe(
        "[[0]]",
      );
    }
    expectCode(
      () => canonicalizeJsonV11([[0]], { testLimits: { maxContainerDepth: 1 } }),
      "VIVI_FMT_DEPTH_EXCEEDED",
    );
    expect(canonicalizeJsonV11(0, { testLimits: { maxContainerDepth: 0 } })).toBe("0");
  });

  it("rejects raised, negative, fractional, and nonfinite test ceilings", () => {
    for (const key of Object.keys(PROJECT_FORMAT_V11_JSON_LIMITS) as Array<
      keyof typeof PROJECT_FORMAT_V11_JSON_LIMITS
    >) {
      for (const value of [PROJECT_FORMAT_V11_JSON_LIMITS[key] + 1, -1, 0.5, Infinity]) {
        expect(() => canonicalizeJsonV11(null, { testLimits: { [key]: value } })).toThrow(
          RangeError,
        );
      }
    }
  });

  it("rejects escaped expansion before stringifying an over-budget value or key", () => {
    const expanded = "\u0000".repeat(4_096);
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      for (const value of [expanded, { [expanded]: null }]) {
        expectCode(
          () => canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: 4_100 } }),
          "VIVI_FMT_JSON_TOO_LARGE",
        );
      }
      expect(stringify.mock.calls.some(([value]) => value === expanded)).toBe(false);
    } finally {
      stringify.mockRestore();
    }
  });

  it("shares output and token budgets across sibling subtrees", () => {
    const first = "a".repeat(8);
    const second = "b".repeat(8);
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      expectCode(
        () =>
          canonicalizeJsonV11([first, second], { testLimits: { maxInputUtf8Bytes: 20 } }),
        "VIVI_FMT_JSON_TOO_LARGE",
      );
      expect(stringify.mock.calls.some(([value]) => value === second)).toBe(false);
      stringify.mockClear();
      expectCode(
        () => canonicalizeJsonV11([first, second], { testLimits: { maxTokens: 4 } }),
        "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
      );
      expect(stringify.mock.calls.some(([value]) => value === second)).toBe(false);
    } finally {
      stringify.mockRestore();
    }
  });

  it("charges shared objects for every appearance without mistaking them for cycles", () => {
    const shared = { a: 0 };
    const value = [shared, shared];
    const canonical = '[{"a":0},{"a":0}]';
    expect(
      canonicalizeJsonV11(value, {
        testLimits: { maxInputUtf8Bytes: canonical.length, maxTokens: 13 },
      }),
    ).toBe(canonical);
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: 16 } }),
      "VIVI_FMT_JSON_TOO_LARGE",
    );
    expectCode(
      () => canonicalizeJsonV11(value, { testLimits: { maxTokens: 12 } }),
      "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
    );
  });

  it("retains UTF-16 key ordering and null-prototype data keys", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value["\ue000"] = 1;
    value["\u{10000}"] = 2;
    value.__proto__ = 3;
    expect(canonicalizeJsonV11(value)).toBe('{"__proto__":3,"𐀀":2,"":1}');
  });

  it("rejects all existing non-data property forms and invalid scalar strings", () => {
    for (const value of ["\ud800", "\udfff", { "\ud800": null }]) {
      expectCode(() => canonicalizeJsonV11(value), "VIVI_FMT_UNICODE_SCALAR_INVALID");
    }
    for (const value of [
      Object.defineProperty({}, "hidden", { value: 1 }),
      { [Symbol("non-data-key")]: 1 },
      new Date(0),
      undefined,
      1n,
    ]) {
      expectCode(() => canonicalizeJsonV11(value), "VIVI_FMT_INVALID_JSON");
    }
  });

  it("uses source-free budget errors when a value also contains a later getter", () => {
    let getterCalls = 0;
    const value = { a: "synthetic-private-content" };
    Object.defineProperty(value, "z", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "not accessed";
      },
    });
    try {
      canonicalizeJsonV11(value, { testLimits: { maxInputUtf8Bytes: 8 } });
      throw new Error("Expected canonical byte rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectFormatV11JsonError);
      expect((error as ProjectFormatV11JsonError).code).toBe("VIVI_FMT_JSON_TOO_LARGE");
      expect((error as Error).message).toBe(
        "Canonical JSON exceeds the UTF-8 byte limit",
      );
    }
    expect(getterCalls).toBe(0);
  });
});
