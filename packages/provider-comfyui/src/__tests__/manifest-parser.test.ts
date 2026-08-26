import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import canonicalSchema from "../../../../integrations/comfyui/vivi2d_compat_plugin/vivi2d_compat/schema/vivi2d_manifest_v1.json";
import { validateVivi2dManifestV1 } from "../internal/generated/vivi2d-manifest-v1-validator.mjs";
import {
  MAX_VIVI2D_LAYER_IMAGE_BYTES,
  MAX_VIVI2D_MANIFEST_BYTES,
  MAX_VIVI2D_MANIFEST_LAYERS,
  MAX_VIVI2D_TOTAL_LAYER_IMAGE_BYTES,
  MAX_VIVI2D_TOTAL_LAYER_PIXELS,
  parseViviSeeThroughManifest,
  validateViviSeeThroughLayerPng,
} from "../manifest-parser";

function makeLayer(index = 0) {
  return {
    id: `layer_${index}`,
    name: `Layer ${index}`,
    label: "hair_front",
    order: index,
    psd_leaf_token: `layer_${index}`,
    image_path: `layers/layer_${index}.png`,
    bbox: [0, 0, 64, 64],
    confidence: 0.9,
    left_right_split: "center",
    front_back_split: "front",
    depth_stats: { min: 0.1, max: 0.4, mean: 0.2 },
  };
}

function makeManifest() {
  return {
    schema_version: "1.0.0",
    generator: {
      plugin: "vivi2d-compat-comfyui",
      plugin_version: "0.1.0",
      model: "see-through",
      model_version: "test",
    },
    canvas: { width: 128, height: 128 },
    layers: [makeLayer()],
  };
}

function encodeJson(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

function makePng(width: number, height: number, byteLength = 33): ArrayBuffer {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dataView = new DataView(bytes.buffer);
  dataView.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  dataView.setUint32(16, width);
  dataView.setUint32(20, height);
  return bytes.buffer;
}

function parse(value: unknown) {
  return parseViviSeeThroughManifest(encodeJson(value));
}

describe("Vivi2D manifest parser", () => {
  it("parses a structurally and semantically valid manifest", () => {
    expect(parse(makeManifest())).toEqual(makeManifest());
  });

  it("keeps the generated structural validator in parity with the canonical schema", () => {
    const reference = new Ajv2020({
      allErrors: false,
      allowUnionTypes: true,
      strict: false,
      validateFormats: false,
    }).compile(canonicalSchema);
    const corpus: unknown[] = [
      makeManifest(),
      null,
      [],
      {},
      { ...makeManifest(), unexpected: true },
      { ...makeManifest(), schema_version: "2.0.0" },
      { ...makeManifest(), canvas: { width: 0, height: 1 } },
      { ...makeManifest(), layers: [{ ...makeLayer(), confidence: 2 }] },
    ];

    for (const value of corpus) {
      expect(validateVivi2dManifestV1(structuredClone(value))).toBe(
        reference(structuredClone(value)),
      );
    }
  });

  it("rejects an oversized payload before decoding it", () => {
    expect(() =>
      parseViviSeeThroughManifest(new ArrayBuffer(MAX_VIVI2D_MANIFEST_BYTES + 1)),
    ).toThrow(/maximum supported size/i);
  });

  it("rejects malformed UTF-8 and malformed JSON without echoing contents", () => {
    expect(() =>
      parseViviSeeThroughManifest(new Uint8Array([0xc3, 0x28]).buffer),
    ).toThrow(/valid UTF-8/i);

    const marker = "DO_NOT_ECHO_INPUT_MARKER";
    try {
      parseViviSeeThroughManifest(
        new TextEncoder().encode(`{"prompt":"${marker}","layers":`).buffer,
      );
      throw new Error("Expected malformed JSON to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/valid JSON/i);
      expect((error as Error).message).not.toContain(marker);
    }
  });

  it("rejects structural schema violations", () => {
    expect(() => parse([])).toThrow(/expected schema/i);
    expect(() => parse({ ...makeManifest(), unexpected: true })).toThrow(
      /expected schema/i,
    );
    expect(() => parse({ ...makeManifest(), schema_version: "2.0.0" })).toThrow(
      /expected schema/i,
    );
  });

  it("bounds layer count before full schema validation", () => {
    const manifest = makeManifest();
    manifest.layers = Array.from({ length: MAX_VIVI2D_MANIFEST_LAYERS + 1 }, (_, index) =>
      makeLayer(index),
    );
    expect(() => parse(manifest)).toThrow(/too many layers/i);
  });

  it("accepts exactly the provider artifact-aligned layer limit", () => {
    const manifest = makeManifest();
    manifest.layers = Array.from({ length: MAX_VIVI2D_MANIFEST_LAYERS }, (_, index) =>
      makeLayer(index),
    );
    expect(parse(manifest).layers).toHaveLength(MAX_VIVI2D_MANIFEST_LAYERS);
  });

  it("bounds canvas side and area", () => {
    expect(() =>
      parse({ ...makeManifest(), canvas: { width: 8193, height: 1 } }),
    ).toThrow(/maximum supported side/i);
    expect(() =>
      parse({ ...makeManifest(), canvas: { width: 4097, height: 4096 } }),
    ).toThrow(/maximum supported area/i);
  });

  it("bounds manifest strings by UTF-8 byte length", () => {
    const boundary = makeManifest();
    boundary.layers[0]!.id = "a".repeat(256);
    boundary.layers[0]!.psd_leaf_token = "b".repeat(256);
    boundary.layers[0]!.name = "n".repeat(1024);
    boundary.layers[0]!.image_path = `${"p".repeat(4092)}.png`;
    expect(() => parse(boundary)).not.toThrow();

    const overflow = makeManifest();
    overflow.layers[0]!.id = "a".repeat(257);
    expect(() => parse(overflow)).toThrow(/maximum supported length/i);
  });

  it("rejects duplicate identifiers and leaf tokens", () => {
    const duplicateId = makeManifest();
    duplicateId.layers = [makeLayer(0), { ...makeLayer(1), id: "layer_0" }];
    expect(() => parse(duplicateId)).toThrow(/duplicate layer id/i);

    const duplicateToken = makeManifest();
    duplicateToken.layers = [
      makeLayer(0),
      { ...makeLayer(1), psd_leaf_token: "layer_0" },
    ];
    expect(() => parse(duplicateToken)).toThrow(/duplicate PSD leaf token/i);
  });

  it("rejects unsafe layer asset paths", () => {
    for (const imagePath of [
      "../outside.png",
      "/absolute.png",
      "C:/absolute.png",
      "file:outside.png",
      "layers/\0outside.png",
      "output/other-job/secret.png",
      "temp/other-job/secret.png",
    ]) {
      const manifest = makeManifest();
      manifest.layers[0]!.image_path = imagePath;
      expect(() => parse(manifest), imagePath).toThrow(
        /invalid|relative|reserved|traversal/i,
      );
    }
  });

  it("rejects invalid bbox and aggregate layer area", () => {
    const inverted = makeManifest();
    inverted.layers[0]!.bbox = [0, 0, 0, 64];
    expect(() => parse(inverted)).toThrow(/outside the canvas/i);

    const outside = makeManifest();
    outside.layers[0]!.bbox = [0, 0, 129, 64];
    expect(() => parse(outside)).toThrow(/outside the canvas/i);

    const aggregate = makeManifest();
    aggregate.canvas = { width: 4096, height: 4096 };
    aggregate.layers = Array.from({ length: 5 }, (_, index) => ({
      ...makeLayer(index),
      bbox: [0, 0, 4096, 4096],
    }));
    expect(() => parse(aggregate)).toThrow(/maximum total area/i);
  });

  it("rejects inconsistent depth statistics and generator versions", () => {
    const depth = makeManifest();
    depth.layers[0]!.depth_stats = { min: 0.7, mean: 0.5, max: 0.6 };
    expect(() => parse(depth)).toThrow(/depth_stats is inconsistent/i);

    const version = makeManifest();
    version.generator.plugin_version = "0.2.0";
    expect(() => parse(version)).toThrow(/generator version is unsupported/i);
  });

  it("rejects non-finite depth statistics produced by overflowing JSON numbers", () => {
    const source = JSON.stringify(makeManifest());
    for (const [field, literal] of [
      ["min", "-1e400"],
      ["mean", "1e400"],
      ["max", "1e400"],
    ] as const) {
      const raw = source.replace(
        new RegExp(`"${field}":(?:0\\.1|0\\.2|0\\.4)`),
        `"${field}":${literal}`,
      );
      expect(() =>
        parseViviSeeThroughManifest(new TextEncoder().encode(raw).buffer),
      ).toThrow(/depth_stats must be finite/i);
    }
  });

  it("validates PNG IHDR dimensions before image decoding", () => {
    const layer = { bbox: [0, 0, 64, 32] as [number, number, number, number] };
    expect(validateViviSeeThroughLayerPng(makePng(64, 32), layer)).toEqual({
      encodedBytes: 33,
      decodedPixels: 2048,
    });
    expect(() => validateViviSeeThroughLayerPng(new ArrayBuffer(33), layer)).toThrow(
      /valid PNG.*IHDR/i,
    );
    expect(() => validateViviSeeThroughLayerPng(makePng(32, 64), layer)).toThrow(
      /do not match.*bbox/i,
    );
    expect(() =>
      validateViviSeeThroughLayerPng(makePng(8193, 1), {
        bbox: [0, 0, 8193, 1],
      }),
    ).toThrow(/maximum supported side/i);
    expect(() =>
      validateViviSeeThroughLayerPng(makePng(4097, 4096), {
        bbox: [0, 0, 4097, 4096],
      }),
    ).toThrow(/maximum supported area/i);
  });

  it("bounds encoded bytes and decoded pixels cumulatively", () => {
    const layer = { bbox: [0, 0, 64, 64] as [number, number, number, number] };
    expect(() =>
      validateViviSeeThroughLayerPng(makePng(64, 64), layer, {
        encodedBytes: MAX_VIVI2D_TOTAL_LAYER_IMAGE_BYTES - 32,
        decodedPixels: 0,
      }),
    ).toThrow(/maximum total encoded size/i);
    expect(() =>
      validateViviSeeThroughLayerPng(makePng(64, 64), layer, {
        encodedBytes: 0,
        decodedPixels: MAX_VIVI2D_TOTAL_LAYER_PIXELS - 4095,
      }),
    ).toThrow(/maximum total decoded area/i);
  });

  it("allows PNG overhead above 64 MiB for a valid 4096-square RGBA layer", () => {
    const encodedBytes = 4096 * 4096 * 4 + 4096 + 64 * 1024;
    expect(encodedBytes).toBeGreaterThan(64 * 1024 * 1024);
    expect(encodedBytes).toBeLessThanOrEqual(MAX_VIVI2D_LAYER_IMAGE_BYTES);
    expect(
      validateViviSeeThroughLayerPng(makePng(4096, 4096, encodedBytes), {
        bbox: [0, 0, 4096, 4096],
      }),
    ).toEqual({ encodedBytes, decodedPixels: 4096 * 4096 });
  });
});
