import { MAX_VIVI_TEXT_FILE_BYTES } from "../load-limits";

export const PROJECT_FORMAT_V11_JSON_LIMITS = Object.freeze({
  maxInputUtf8Bytes: MAX_VIVI_TEXT_FILE_BYTES,
  maxContainerDepth: 64,
  maxTokens: 8_000_000,
  maxDecodedStringUtf8Bytes: 64 * 1024 * 1024,
});

export interface ProjectFormatV11JsonLimits {
  maxInputUtf8Bytes: number;
  maxContainerDepth: number;
  maxTokens: number;
  maxDecodedStringUtf8Bytes: number;
}

export interface ParseJsonV11Options {
  /** Tests may lower a ceiling to exercise a boundary without allocating huge input. */
  testLimits?: Partial<ProjectFormatV11JsonLimits>;
}

export type ViviJsonValueV11 =
  | null
  | boolean
  | number
  | string
  | ViviJsonValueV11[]
  | { [key: string]: ViviJsonValueV11 };

export type ProjectFormatV11JsonErrorCode =
  | "VIVI_FMT_JSON_TOO_LARGE"
  | "VIVI_FMT_INVALID_JSON"
  | "VIVI_FMT_DUPLICATE_MAP_KEY"
  | "VIVI_FMT_DEPTH_EXCEEDED"
  | "VIVI_FMT_TOKEN_LIMIT_EXCEEDED"
  | "VIVI_FMT_STRING_TOO_LARGE"
  | "VIVI_FMT_UNICODE_SCALAR_INVALID"
  | "VIVI_FMT_INT_PRECISION_LOSS";

export class ProjectFormatV11JsonError extends Error {
  readonly code: ProjectFormatV11JsonErrorCode;
  readonly offset?: number;

  constructor(code: ProjectFormatV11JsonErrorCode, message: string, offset?: number) {
    super(message);
    this.name = "ProjectFormatV11JsonError";
    this.code = code;
    this.offset = offset;
  }
}

export function parseJsonV11(
  source: string,
  options: ParseJsonV11Options = {},
): ViviJsonValueV11 {
  const limits = resolveLimits(options.testLimits);
  assertInputSizeAndUnicode(source, limits.maxInputUtf8Bytes);
  if (source.charCodeAt(0) === 0xfeff) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_INVALID_JSON",
      "UTF-8 BOM is not accepted by the Project Format v11 JSON codec",
      0,
    );
  }
  return new JsonV11Parser(source, limits).parse();
}

export function canonicalizeJsonV11(value: unknown): string {
  return canonicalizeValue(value, 0, new WeakSet<object>());
}

class JsonV11Parser {
  private offset = 0;
  private tokenCount = 0;

  constructor(
    private readonly source: string,
    private readonly limits: ProjectFormatV11JsonLimits,
  ) {}

  parse(): ViviJsonValueV11 {
    this.skipWhitespace();
    if (this.offset === this.source.length) {
      this.invalid("JSON input is empty");
    }
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.offset !== this.source.length) {
      this.invalid("Unexpected content after the root JSON value");
    }
    return value;
  }

  private parseValue(containerDepth: number): ViviJsonValueV11 {
    const code = this.source.charCodeAt(this.offset);
    if (code === 0x22) return this.parseString();
    if (code === 0x7b) return this.parseObject(containerDepth + 1);
    if (code === 0x5b) return this.parseArray(containerDepth + 1);
    if (code === 0x74) return this.parseKeyword("true", true);
    if (code === 0x66) return this.parseKeyword("false", false);
    if (code === 0x6e) return this.parseKeyword("null", null);
    if (code === 0x2d || isAsciiDigit(code)) return this.parseNumber();
    this.invalid("Expected a JSON value");
  }

  private parseObject(depth: number): { [key: string]: ViviJsonValueV11 } {
    this.assertDepth(depth);
    this.consumePunctuation("{");
    this.skipWhitespace();

    const value: { [key: string]: ViviJsonValueV11 } = {};
    const keys = new Set<string>();
    if (this.peek("}")) {
      this.consumePunctuation("}");
      return value;
    }

    while (true) {
      if (!this.peek('"')) this.invalid("Expected a string object key");
      const keyOffset = this.offset;
      const key = this.parseString();
      if (keys.has(key)) {
        throw new ProjectFormatV11JsonError(
          "VIVI_FMT_DUPLICATE_MAP_KEY",
          `Duplicate decoded object key ${JSON.stringify(key)}`,
          keyOffset,
        );
      }
      keys.add(key);

      this.skipWhitespace();
      this.consumePunctuation(":");
      this.skipWhitespace();
      const child = this.parseValue(depth);
      Object.defineProperty(value, key, {
        configurable: true,
        enumerable: true,
        value: child,
        writable: true,
      });

      this.skipWhitespace();
      if (this.peek("}")) {
        this.consumePunctuation("}");
        return value;
      }
      this.consumePunctuation(",");
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): ViviJsonValueV11[] {
    this.assertDepth(depth);
    this.consumePunctuation("[");
    this.skipWhitespace();

    const value: ViviJsonValueV11[] = [];
    if (this.peek("]")) {
      this.consumePunctuation("]");
      return value;
    }

    while (true) {
      value.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.peek("]")) {
        this.consumePunctuation("]");
        return value;
      }
      this.consumePunctuation(",");
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.bumpToken();
    const startOffset = this.offset;
    this.offset += 1;
    const pieces: string[] = [];
    let rawStart = this.offset;

    while (this.offset < this.source.length) {
      const code = this.source.charCodeAt(this.offset);
      if (code === 0x22) {
        pieces.push(this.source.slice(rawStart, this.offset));
        this.offset += 1;
        const decoded = pieces.join("");
        assertDecodedStringUtf8Limit(
          decoded,
          this.limits.maxDecodedStringUtf8Bytes,
          startOffset,
        );
        return decoded;
      }
      if (code <= 0x1f) this.invalid("Unescaped control character in JSON string");
      if (code !== 0x5c) {
        this.offset += 1;
        continue;
      }

      pieces.push(this.source.slice(rawStart, this.offset));
      this.offset += 1;
      if (this.offset >= this.source.length) {
        this.invalid("Unterminated JSON escape sequence");
      }
      const escapeCode = this.source.charCodeAt(this.offset);
      this.offset += 1;
      switch (escapeCode) {
        case 0x22:
          pieces.push('"');
          break;
        case 0x2f:
          pieces.push("/");
          break;
        case 0x5c:
          pieces.push("\\");
          break;
        case 0x62:
          pieces.push("\b");
          break;
        case 0x66:
          pieces.push("\f");
          break;
        case 0x6e:
          pieces.push("\n");
          break;
        case 0x72:
          pieces.push("\r");
          break;
        case 0x74:
          pieces.push("\t");
          break;
        case 0x75:
          pieces.push(String.fromCharCode(this.parseHexCodeUnit()));
          break;
        default:
          this.invalid("Invalid JSON escape sequence");
      }
      rawStart = this.offset;
    }

    this.invalid("Unterminated JSON string");
  }

  private parseHexCodeUnit(): number {
    if (this.offset + 4 > this.source.length) {
      this.invalid("Incomplete JSON Unicode escape");
    }
    let result = 0;
    for (let index = 0; index < 4; index += 1) {
      const digit = hexDigitValue(this.source.charCodeAt(this.offset + index));
      if (digit < 0) this.invalid("Invalid JSON Unicode escape");
      result = result * 16 + digit;
    }
    this.offset += 4;
    return result;
  }

  private parseNumber(): number {
    this.bumpToken();
    const startOffset = this.offset;

    if (this.peek("-")) this.offset += 1;
    if (this.peek("0")) {
      this.offset += 1;
    } else {
      const first = this.source.charCodeAt(this.offset);
      if (first < 0x31 || first > 0x39) this.invalid("Invalid JSON number");
      this.offset += 1;
      while (isAsciiDigit(this.source.charCodeAt(this.offset))) this.offset += 1;
    }

    if (this.peek(".")) {
      this.offset += 1;
      if (!isAsciiDigit(this.source.charCodeAt(this.offset))) {
        this.invalid("JSON fraction requires at least one digit");
      }
      while (isAsciiDigit(this.source.charCodeAt(this.offset))) this.offset += 1;
    }

    const exponent = this.source.charCodeAt(this.offset);
    if (exponent === 0x65 || exponent === 0x45) {
      this.offset += 1;
      if (this.peek("+") || this.peek("-")) this.offset += 1;
      if (!isAsciiDigit(this.source.charCodeAt(this.offset))) {
        this.invalid("JSON exponent requires at least one digit");
      }
      while (isAsciiDigit(this.source.charCodeAt(this.offset))) this.offset += 1;
    }

    const spelling = this.source.slice(startOffset, this.offset);
    const value = Number(spelling);
    if (!Number.isFinite(value)) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INT_PRECISION_LOSS",
        `JSON number is outside the finite IEEE-754 range: ${spelling}`,
        startOffset,
      );
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INT_PRECISION_LOSS",
        `JSON integer is outside the safe integer range: ${spelling}`,
        startOffset,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }

  private parseKeyword<T extends boolean | null>(spelling: string, value: T): T {
    this.bumpToken();
    if (!this.source.startsWith(spelling, this.offset)) {
      this.invalid(`Invalid JSON token; expected ${spelling}`);
    }
    this.offset += spelling.length;
    return value;
  }

  private consumePunctuation(expected: string): void {
    if (!this.peek(expected)) this.invalid(`Expected ${JSON.stringify(expected)}`);
    this.bumpToken();
    this.offset += 1;
  }

  private assertDepth(depth: number): void {
    if (depth > this.limits.maxContainerDepth) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_DEPTH_EXCEEDED",
        `JSON container depth exceeds ${this.limits.maxContainerDepth}`,
        this.offset,
      );
    }
  }

  private bumpToken(): void {
    this.tokenCount += 1;
    if (this.tokenCount > this.limits.maxTokens) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
        `JSON token count exceeds ${this.limits.maxTokens}`,
        this.offset,
      );
    }
  }

  private skipWhitespace(): void {
    while (this.offset < this.source.length) {
      const code = this.source.charCodeAt(this.offset);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return;
      this.offset += 1;
    }
  }

  private peek(expected: string): boolean {
    return this.source.startsWith(expected, this.offset);
  }

  private invalid(message: string): never {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_INVALID_JSON",
      `${message} at UTF-16 offset ${this.offset}`,
      this.offset,
    );
  }
}

function resolveLimits(
  overrides: Partial<ProjectFormatV11JsonLimits> | undefined,
): ProjectFormatV11JsonLimits {
  const limits: ProjectFormatV11JsonLimits = {
    ...PROJECT_FORMAT_V11_JSON_LIMITS,
  };
  if (!overrides) return limits;

  for (const key of Object.keys(limits) as Array<keyof ProjectFormatV11JsonLimits>) {
    const override = overrides[key];
    if (override === undefined) continue;
    if (!Number.isSafeInteger(override) || override < 0 || override > limits[key]) {
      throw new RangeError(
        `testLimits.${key} must be a safe integer from 0 through ${limits[key]}`,
      );
    }
    limits[key] = override;
  }
  return limits;
}

function assertInputSizeAndUnicode(source: string, maxByteLength: number): void {
  const byteLength = utf8ByteLengthOfWellFormedString(source, maxByteLength, 0);
  if (byteLength > maxByteLength) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_JSON_TOO_LARGE",
      `JSON input exceeds ${maxByteLength} UTF-8 bytes`,
      0,
    );
  }
}

function utf8ByteLengthOfWellFormedString(
  value: string,
  stopAfter: number,
  errorOffsetBase: number,
): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      byteLength += 1;
    } else if (code <= 0x7ff) {
      byteLength += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        throw new ProjectFormatV11JsonError(
          "VIVI_FMT_UNICODE_SCALAR_INVALID",
          "JSON text contains an unpaired high surrogate",
          errorOffsetBase + index,
        );
      }
      byteLength += 4;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_UNICODE_SCALAR_INVALID",
        "JSON text contains an unpaired low surrogate",
        errorOffsetBase + index,
      );
    } else {
      byteLength += 3;
    }
    if (byteLength > stopAfter) return byteLength;
  }
  return byteLength;
}

function canonicalizeValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertDecodedStringUtf8Limit(
      value,
      PROJECT_FORMAT_V11_JSON_LIMITS.maxDecodedStringUtf8Bytes,
      0,
    );
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INT_PRECISION_LOSS",
        "Canonical JSON only accepts finite numbers",
      );
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INT_PRECISION_LOSS",
        "Canonical JSON only accepts integers in the safe integer range",
      );
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_INVALID_JSON",
      `Canonical JSON cannot represent ${typeof value}`,
    );
  }
  if (depth + 1 > PROJECT_FORMAT_V11_JSON_LIMITS.maxContainerDepth) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_DEPTH_EXCEEDED",
      `JSON container depth exceeds ${PROJECT_FORMAT_V11_JSON_LIMITS.maxContainerDepth}`,
    );
  }
  if (ancestors.has(value)) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_INVALID_JSON",
      "Canonical JSON cannot represent a cyclic value",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some((key) => typeof key !== "string") ||
        ownKeys.length !== value.length + 1
      ) {
        throw new ProjectFormatV11JsonError(
          "VIVI_FMT_INVALID_JSON",
          "Canonical JSON only accepts dense arrays without extra properties",
        );
      }
      const elements: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new ProjectFormatV11JsonError(
            "VIVI_FMT_INVALID_JSON",
            "Canonical JSON only accepts enumerable array data properties",
          );
        }
        elements.push(canonicalizeValue(descriptor.value, depth + 1, ancestors));
      }
      return `[${elements.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INVALID_JSON",
        "Canonical JSON only accepts plain objects",
      );
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INVALID_JSON",
        "Canonical JSON only accepts string object keys",
      );
    }
    const keys = Object.keys(value).sort();
    if (keys.length !== ownKeys.length) {
      throw new ProjectFormatV11JsonError(
        "VIVI_FMT_INVALID_JSON",
        "Canonical JSON only accepts enumerable data properties",
      );
    }
    return `{${keys
      .map((key) => {
        assertDecodedStringUtf8Limit(
          key,
          PROJECT_FORMAT_V11_JSON_LIMITS.maxDecodedStringUtf8Bytes,
          0,
        );
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) {
          throw new ProjectFormatV11JsonError(
            "VIVI_FMT_INVALID_JSON",
            "Canonical JSON does not invoke object accessors",
          );
        }
        return `${JSON.stringify(key)}:${canonicalizeValue(
          descriptor.value,
          depth + 1,
          ancestors,
        )}`;
      })
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertDecodedStringUtf8Limit(
  value: string,
  maxByteLength: number,
  errorOffsetBase: number,
): void {
  const byteLength = utf8ByteLengthOfWellFormedString(
    value,
    maxByteLength,
    errorOffsetBase,
  );
  if (byteLength > maxByteLength) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_STRING_TOO_LARGE",
      `Decoded JSON string exceeds ${maxByteLength} UTF-8 bytes`,
      errorOffsetBase,
    );
  }
}

function isAsciiDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function hexDigitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
}
