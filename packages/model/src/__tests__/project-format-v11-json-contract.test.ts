import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
});
