const RAW_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const UTF8_CHUNK_CODE_UNITS = 8_192;

/** Encode with the replacement behavior required by the Encoding Standard. */
export function encodeUtf8(value: string): Uint8Array {
  const bytes = new Uint8Array(utf8ByteLength(value));
  let byteOffset = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    let codePoint = codeUnit;
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        codePoint = 0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      bytes[byteOffset] = codePoint;
      byteOffset += 1;
    } else if (codePoint <= 0x7ff) {
      bytes[byteOffset] = 0xc0 | (codePoint >> 6);
      bytes[byteOffset + 1] = 0x80 | (codePoint & 0x3f);
      byteOffset += 2;
    } else if (codePoint <= 0xffff) {
      bytes[byteOffset] = 0xe0 | (codePoint >> 12);
      bytes[byteOffset + 1] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[byteOffset + 2] = 0x80 | (codePoint & 0x3f);
      byteOffset += 3;
    } else {
      bytes[byteOffset] = 0xf0 | (codePoint >> 18);
      bytes[byteOffset + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
      bytes[byteOffset + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[byteOffset + 3] = 0x80 | (codePoint & 0x3f);
      byteOffset += 4;
    }
  }

  return bytes;
}

export function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
    } else {
      // BMP scalars and replacement output for lone low surrogates are 3 bytes.
      byteLength += 3;
    }
  }
  return byteLength;
}

/** Decode UTF-8 while rejecting every ill-formed byte sequence. */
export function decodeUtf8Fatal(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let codeUnits: number[] = [];

  const flush = (): void => {
    if (codeUnits.length === 0) return;
    chunks.push(String.fromCharCode(...codeUnits));
    codeUnits = [];
  };
  const pushCodePoint = (codePoint: number): void => {
    if (codePoint <= 0xffff) {
      codeUnits.push(codePoint);
    } else {
      const astral = codePoint - 0x10000;
      codeUnits.push(0xd800 | (astral >> 10), 0xdc00 | (astral & 0x3ff));
    }
    if (codeUnits.length >= UTF8_CHUNK_CODE_UNITS) flush();
  };
  const invalid = (offset: number): never => {
    throw new TypeError(`Invalid UTF-8 at byte offset ${offset}`);
  };
  const continuation = (offset: number): number => {
    const byte = bytes[offset];
    if (byte === undefined) return invalid(offset);
    if (byte < 0x80 || byte > 0xbf) invalid(offset);
    return byte;
  };

  for (let offset = 0; offset < bytes.length; ) {
    const first = bytes[offset]!;
    if (first <= 0x7f) {
      pushCodePoint(first);
      offset += 1;
      continue;
    }

    if (first >= 0xc2 && first <= 0xdf) {
      const second = continuation(offset + 1);
      pushCodePoint(((first & 0x1f) << 6) | (second & 0x3f));
      offset += 2;
      continue;
    }

    if (first >= 0xe0 && first <= 0xef) {
      const second = continuation(offset + 1);
      const third = continuation(offset + 2);
      if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second > 0x9f)) {
        invalid(offset);
      }
      pushCodePoint(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
      offset += 3;
      continue;
    }

    if (first >= 0xf0 && first <= 0xf4) {
      const second = continuation(offset + 1);
      const third = continuation(offset + 2);
      const fourth = continuation(offset + 3);
      if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second > 0x8f)) {
        invalid(offset);
      }
      pushCodePoint(
        ((first & 0x07) << 18) |
          ((second & 0x3f) << 12) |
          ((third & 0x3f) << 6) |
          (fourth & 0x3f),
      );
      offset += 4;
      continue;
    }

    invalid(offset);
  }

  flush();
  return chunks.join("");
}

export function compareUtf8Bytes(left: string, right: string): number {
  const leftBytes = encodeUtf8(left);
  const rightBytes = encodeUtf8(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

/** Decode the unwrapped, canonical alphabet accepted by the Project v11 schema. */
export function decodeRawBase64(value: string): Uint8Array {
  if (!RAW_BASE64_PATTERN.test(value)) {
    throw new TypeError("Invalid raw base64");
  }
  if (value.length === 0) return new Uint8Array(0);

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const result = new Uint8Array((value.length / 4) * 3 - padding);
  let outputOffset = 0;

  for (let offset = 0; offset < value.length; offset += 4) {
    const first = base64Value(value.charCodeAt(offset));
    const second = base64Value(value.charCodeAt(offset + 1));
    const thirdCode = value.charCodeAt(offset + 2);
    const fourthCode = value.charCodeAt(offset + 3);
    const third = thirdCode === 0x3d ? 0 : base64Value(thirdCode);
    const fourth = fourthCode === 0x3d ? 0 : base64Value(fourthCode);

    result[outputOffset] = (first << 2) | (second >> 4);
    outputOffset += 1;
    if (thirdCode !== 0x3d) {
      result[outputOffset] = ((second & 0x0f) << 4) | (third >> 2);
      outputOffset += 1;
    }
    if (fourthCode !== 0x3d) {
      result[outputOffset] = ((third & 0x03) << 6) | fourth;
      outputOffset += 1;
    }
  }

  return result;
}

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  throw new TypeError("Invalid raw base64");
}

/**
 * Detach a JSON-shaped value without invoking accessors or the legacy
 * `__proto__` setter. Negative zero and null prototypes are preserved.
 */
export function cloneJsonDetached<T>(value: T): T {
  const clones = new WeakMap<object, unknown>();
  const active = new WeakSet<object>();

  const clone = (current: unknown): unknown => {
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      typeof current === "number" ||
      typeof current === "undefined"
    ) {
      return current;
    }
    if (typeof current !== "object") {
      throw new TypeError("Detached JSON clone only accepts JSON-shaped values");
    }

    const knownClone = clones.get(current);
    if (knownClone !== undefined) {
      if (active.has(current)) {
        throw new TypeError("Detached JSON clone does not accept cyclic values");
      }
      return knownClone;
    }

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) {
        throw new TypeError("Detached JSON clone only accepts standard arrays");
      }
      const ownKeys = Reflect.ownKeys(current);
      if (
        ownKeys.some((key) => typeof key !== "string") ||
        ownKeys.length !== current.length + 1
      ) {
        throw new TypeError("Detached JSON clone only accepts dense arrays");
      }
      const output = new Array<unknown>(current.length);
      clones.set(current, output);
      active.add(current);
      try {
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw new TypeError(
              "Detached JSON clone only accepts enumerable array data properties",
            );
          }
          output[index] = clone(descriptor.value);
        }
      } finally {
        active.delete(current);
      }
      return output;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Detached JSON clone only accepts plain objects");
    }
    const output: Record<string, unknown> = Object.create(prototype) as Record<
      string,
      unknown
    >;
    clones.set(current, output);
    active.add(current);
    try {
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") {
          throw new TypeError("Detached JSON clone does not accept symbol properties");
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new TypeError(
            "Detached JSON clone only accepts enumerable object data properties",
          );
        }
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          value: clone(descriptor.value),
          writable: true,
        });
      }
    } finally {
      active.delete(current);
    }
    return output;
  };

  return clone(value) as T;
}
