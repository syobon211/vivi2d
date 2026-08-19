import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ProjectFormatV11CodecOptions,
  parseProjectFormatV11Json,
  parseProjectFormatV11Utf8,
  serializeProjectFormatV11Ordinary,
} from "../project-format-v11/codec";
import type { ProjectFormatV11JsonError } from "../project-format-v11/json-contract";
import {
  cloneJsonDetached,
  compareUtf8Bytes,
  decodeRawBase64,
  decodeUtf8Fatal,
  encodeUtf8,
  utf8ByteLength,
} from "../project-format-v11/portable-primitives";
import type { ExtensionRegistryEntryV11, Sha256V11 } from "../project-format-v11/types";

const ZERO_BYTE_SHA256 =
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
const OTHER_SHA256 = "b".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

function project(): Record<string, unknown> {
  return {
    name: "portable-project",
    width: 16,
    height: 16,
    layers: [],
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0,
      smoothing: 0,
      gain: 1,
    },
    skins: {},
    parameterBindings: [],
    sceneBlends: [],
    ikControllers: [],
    offscreenTargets: [],
    expressionPresets: [],
    colliders: [],
    stateMachines: [],
  };
}

function embeddedWire(): Record<string, unknown> {
  return {
    version: 11,
    assetMode: "embedded",
    project: project(),
    atlases: [],
  };
}

function knownAssetRegistry(): ReadonlyMap<string, ExtensionRegistryEntryV11> {
  const entry: ExtensionRegistryEntryV11 = {
    id: "known.asset",
    supportedSchemaVersions: [1],
    requiredCapability: {
      id: "vivi.cap.knownAsset",
      minVersionForSchema: { 1: 1 },
    },
    affects: ["edit"],
    validateEnvelope: () => true,
  };
  return new Map([[entry.id, entry]]);
}

function options(
  sha256: Sha256V11 = () => OTHER_SHA256,
  registry: ProjectFormatV11CodecOptions["registry"] = new Map(),
  supportedCapabilities: ProjectFormatV11CodecOptions["supportedCapabilities"] = new Map(),
): ProjectFormatV11CodecOptions {
  return { registry, supportedCapabilities, sha256 };
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

describe("Project Format v11 portable UTF-8 primitives", () => {
  it("encodes scalar boundaries and replaces lone surrogates like the Encoding Standard", () => {
    const value = `\u0000\u007f\u0080\u07ff\u0800\uffff\ud83d\ude00\udbff\udfff`;
    const expected = [
      0x00, 0x7f, 0xc2, 0x80, 0xdf, 0xbf, 0xe0, 0xa0, 0x80, 0xef, 0xbf, 0xbf, 0xf0, 0x9f,
      0x98, 0x80, 0xf4, 0x8f, 0xbf, 0xbf,
    ];
    expect([...encodeUtf8(value)]).toEqual(expected);
    expect(utf8ByteLength(value)).toBe(expected.length);
    expect([...encodeUtf8("\ud800A\udc00")]).toEqual([
      0xef, 0xbf, 0xbd, 0x41, 0xef, 0xbf, 0xbd,
    ]);
    expect(utf8ByteLength("\ud800A\udc00")).toBe(7);
  });

  it("decodes every valid UTF-8 scalar width", () => {
    const bytes = Uint8Array.from([
      0x00, 0x7f, 0xc2, 0x80, 0xdf, 0xbf, 0xe0, 0xa0, 0x80, 0xef, 0xbf, 0xbf, 0xf0, 0x90,
      0x80, 0x80, 0xf4, 0x8f, 0xbf, 0xbf,
    ]);
    expect(decodeUtf8Fatal(bytes)).toBe(
      `\u0000\u007f\u0080\u07ff\u0800\uffff\ud800\udc00\udbff\udfff`,
    );
  });

  it.each([
    ["lone continuation", [0x80]],
    ["invalid continuation", [0xc2, 0x20]],
    ["truncated two-byte", [0xc2]],
    ["truncated three-byte", [0xe2, 0x82]],
    ["truncated four-byte", [0xf0, 0x9f, 0x92]],
    ["overlong two-byte", [0xc0, 0xaf]],
    ["overlong three-byte", [0xe0, 0x80, 0xaf]],
    ["overlong four-byte", [0xf0, 0x80, 0x80, 0xaf]],
    ["encoded surrogate", [0xed, 0xa0, 0x80]],
    ["above U+10FFFF", [0xf4, 0x90, 0x80, 0x80]],
    ["invalid leading byte", [0xf5, 0x80, 0x80, 0x80]],
  ])("fatally rejects %s", (_label, input) => {
    expect(() => decodeUtf8Fatal(Uint8Array.from(input))).toThrow(/Invalid UTF-8/u);
  });

  it("orders by encoded UTF-8 bytes", () => {
    const values = ["z", "é", "😀", "a"];
    expect(values.sort(compareUtf8Bytes)).toEqual(["a", "z", "é", "😀"]);
  });

  it("preserves the codec's explicit UTF-8 BOM rejection", async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    await expect(parseProjectFormatV11Utf8(bytes, options())).rejects.toMatchObject({
      code: "VIVI_FMT_INVALID_JSON",
      offset: 0,
    } satisfies Partial<ProjectFormatV11JsonError>);
  });
});

describe("Project Format v11 strict raw base64", () => {
  it.each([
    ["", []],
    ["Zg==", [0x66]],
    ["Zm8=", [0x66, 0x6f]],
    ["Zm9v", [0x66, 0x6f, 0x6f]],
    ["AA==", [0x00]],
    // Preserve the schema's accepted set: unused padding bits need not be zero.
    ["AB==", [0x00]],
  ])("decodes %j", (source, expected) => {
    expect([...decodeRawBase64(source)]).toEqual(expected);
  });

  it.each([
    "Zg=",
    "Z===",
    "Zm 8=",
    "Zm8=\n",
    "Zm8_",
    "=m8=",
    "Zg==AAAA",
  ])("rejects non-raw or malformed input %j", (source) => {
    expect(() => decodeRawBase64(source)).toThrow("Invalid raw base64");
  });
});

describe("Project Format v11 detached JSON clone", () => {
  it("preserves -0, deep ownership, null prototypes, and dangerous own keys", () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(nullPrototype, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { polluted: true },
      writable: true,
    });
    Object.defineProperty(nullPrototype, "constructor", {
      configurable: true,
      enumerable: true,
      value: { safe: true },
      writable: true,
    });
    let nested: Record<string, unknown> = { value: -0 };
    for (let index = 0; index < 64; index += 1) nested = { child: nested };
    nullPrototype.deep = nested;

    const cloned = cloneJsonDetached(nullPrototype);
    expect(Object.getPrototypeOf(cloned)).toBeNull();
    expect(Object.hasOwn(cloned, "__proto__")).toBe(true);
    expect(cloned.__proto__).toEqual({ polluted: true });
    expect(cloned.constructor).toEqual({ safe: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(cloned.deep).not.toBe(nullPrototype.deep);

    let cursor = cloned.deep as Record<string, unknown>;
    for (let index = 0; index < 64; index += 1) {
      cursor = cursor.child as Record<string, unknown>;
    }
    expect(Object.is(cursor.value, -0)).toBe(true);
  });

  it("does not invoke accessors and rejects cycles", () => {
    let getterRan = false;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        getterRan = true;
        return 1;
      },
    });
    expect(() => cloneJsonDetached(accessor)).toThrow(/data properties/u);
    expect(getterRan).toBe(false);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => cloneJsonDetached(cyclic)).toThrow(/cyclic/u);
  });
});

describe("Project Format v11 ambient-free codec", () => {
  it("rejects a missing host SHA-256 provider deterministically", async () => {
    const missingProvider = {
      registry: new Map(),
      supportedCapabilities: new Map(),
    } as unknown as ProjectFormatV11CodecOptions;
    await expect(
      parseProjectFormatV11Json(JSON.stringify(embeddedWire()), missingProvider),
    ).rejects.toThrow("Project Format v11 codec requires a SHA-256 provider");
  });

  it("parses JSON and UTF-8 without encoding, WebCrypto, base64, or clone globals", async () => {
    vi.stubGlobal("TextEncoder", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    vi.stubGlobal("atob", undefined);
    vi.stubGlobal("btoa", undefined);
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("structuredClone", undefined);

    const v10 = { version: 10, project: { layers: [], parameters: [] }, atlases: [] };
    await expect(
      parseProjectFormatV11Json(JSON.stringify(v10), options()),
    ).resolves.toMatchObject({ compatibility: "full" });

    const source = JSON.stringify(embeddedWire());
    await expect(
      parseProjectFormatV11Utf8(asciiBytes(source), options()),
    ).resolves.toMatchObject({
      compatibility: "full",
      normalized: { version: 11, assetMode: "embedded" },
    });
  });

  it.each([
    "sync",
    "async",
  ] as const)("uses an injected %s SHA-256 provider with crypto and atob absent", async (providerKind) => {
    vi.stubGlobal("TextEncoder", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    vi.stubGlobal("atob", undefined);
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("structuredClone", undefined);

    const hashed: number[][] = [];
    const provider: Sha256V11 = (bytes) => {
      hashed.push([...bytes]);
      const digest =
        bytes.length === 1 && bytes[0] === 0 ? ZERO_BYTE_SHA256 : OTHER_SHA256;
      return providerKind === "async" ? Promise.resolve(digest) : digest;
    };
    const wire = embeddedWire();
    wire.extensions = {
      "known.asset": {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.knownAsset",
        data: {},
        blobRefs: [
          {
            objectAddress: ZERO_BYTE_SHA256,
            storageKind: "blob",
            contentSha256: ZERO_BYTE_SHA256,
            mediaType: "application/octet-stream",
            sizeBytes: 1,
          },
        ],
      },
    };
    wire.requires = [{ id: "vivi.cap.knownAsset", minVersion: 1, requiredFor: ["edit"] }];
    wire.embeddedAssets = {
      [`sha256:${ZERO_BYTE_SHA256}`]: {
        contentSha256: ZERO_BYTE_SHA256,
        sizeBytes: 1,
        encoding: "base64",
        data: "AA==",
      },
    };
    const codecOptions = options(
      provider,
      knownAssetRegistry(),
      new Map([["vivi.cap.knownAsset", 1]]),
    );

    const parsed = await parseProjectFormatV11Json(JSON.stringify(wire), codecOptions);
    await expect(serializeProjectFormatV11Ordinary(parsed)).resolves.toContain(
      `"sha256:${ZERO_BYTE_SHA256}"`,
    );
    expect(hashed).toEqual([[0], [0]]);
  });
});
