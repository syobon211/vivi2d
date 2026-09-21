import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNativePngDecoder } from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";
import { VIVI2D_MANIFEST_SCHEMA_VERSION } from "@vivi2d/provider-comfyui";
import fixture from "../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { useEditorStore } from "@/stores/editorStore";
import { getAllTextures, clearTextures } from "../texture-store";
import {
  captureExchangeConsent,
  assertExchangeConsent,
  stageExchangeProposal,
  openExchangeCandidate,
} from "../local-exchange-staging";
import type { ProposalView } from "../local-exchange-provider";
import { parsePsdAsync } from "../workers/psd-parse-client";
import { installProjectV11Display } from "../project-v11-renderer";

let removeDisplayOwner = () => {};

const wire = JSON.parse(fixture.documents[0]!.canonicalUtf8!);
const png = Uint8Array.from(atob(wire.atlases[0].image), (byte) => byte.charCodeAt(0));
const digest = (bytes: Uint8Array) =>
  new Uint8Array(createHash("sha256").update(bytes).digest());

// Test Canvas adapter only. PNG decode uses the actual bundled WASM. Encoding
// supplies real synthetic PNG data to the existing serializer, not a PNG oracle.
function installCanvas() {
  const pixels = new WeakMap<object, ImageData>();
  function raster(canvas: HTMLCanvasElement): ImageData {
    let value = pixels.get(canvas);
    if (!value || value.width !== canvas.width || value.height !== canvas.height) {
      value = new ImageData(
        new Uint8ClampedArray(canvas.width * canvas.height * 4),
        canvas.width,
        canvas.height,
      );
      pixels.set(canvas, value);
    }
    return value;
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const canvas = this;
    return {
      putImageData(image: ImageData) {
        pixels.set(
          canvas,
          new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
        );
      },
      getImageData(x: number, y: number, width: number, height: number) {
        const source = raster(canvas),
          data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height; row++)
          data.set(
            source.data.subarray(
              ((y + row) * source.width + x) * 4,
              ((y + row) * source.width + x + width) * 4,
            ),
            row * width * 4,
          );
        return new ImageData(data, width, height);
      },
      drawImage(source: HTMLCanvasElement | { raster: ImageData }, ...args: number[]) {
        const input = "raster" in source ? source.raster : raster(source),
          output = raster(canvas);
        const [sx, sy, sw, sh, dx, dy] =
          args.length === 2
            ? [0, 0, input.width, input.height, args[0]!, args[1]!]
            : args;
        for (let y = 0; y < sh!; y++)
          for (let x = 0; x < sw!; x++)
            output.data.set(
              input.data.subarray(
                ((sy! + y) * input.width + sx! + x) * 4,
                ((sy! + y) * input.width + sx! + x + 1) * 4,
              ),
              ((dy! + y) * output.width + dx! + x) * 4,
            );
      },
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const image = raster(this),
      header = Buffer.alloc(13);
    header.writeUInt32BE(image.width, 0);
    header.writeUInt32BE(image.height, 4);
    header[8] = 8;
    header[9] = 6;
    const scanlines = Buffer.alloc((image.width * 4 + 1) * image.height);
    for (let y = 0; y < image.height; y++)
      scanlines.set(
        image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4),
        y * (image.width * 4 + 1) + 1,
      );
    const chunk = (kind: string, data: Buffer) => {
      const encoded = Buffer.alloc(data.length + 12);
      encoded.writeUInt32BE(data.length);
      encoded.write(kind, 4);
      data.copy(encoded, 8);
      encoded.writeUInt32BE(crc32(encoded.subarray(4, -4)), encoded.length - 4);
      return encoded;
    };
    return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer()),
      dimensions = new DataView(bytes.buffer);
    const created = await createNativePngDecoder();
    if (!created.ok) throw Error("decoder");
    try {
      const result = created.decoder.decode({
        bytes,
        expectedSha256: digest(bytes),
        width: dimensions.getUint32(16),
        height: dimensions.getUint32(20),
      });
      if (!result.ok) throw Error("PNG");
      return {
        width: result.width,
        height: result.height,
        raster: new ImageData(
          new Uint8ClampedArray(result.rgba),
          result.width,
          result.height,
        ),
        close() {},
      };
    } finally {
      created.decoder.dispose();
    }
  });
}
function proposal(): ProposalView {
  const manifest = {
    schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
    generator: {
      plugin: "vivi2d-compat-comfyui",
      plugin_version: "0.1.0",
      model: "see-through",
      model_version: "test",
    },
    canvas: { width: 1, height: 1 },
    layers: [
      {
        id: "layer_000",
        name: "body",
        label: "body",
        order: 0,
        psd_leaf_token: "layer_000",
        image_path: "layers/layer_000.png",
        bbox: [0, 0, 1, 1],
        confidence: 1,
        left_right_split: "center",
        front_back_split: "front",
        depth_stats: { min: 0, max: 1, mean: 0.5 },
      },
    ],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  return {
    manifest: {
      artifacts: [
        {
          id: "manifest",
          kind: "manifest",
          mediaType: "application/json",
          byteLength: bytes.length,
          sha256: "0".repeat(64),
          path: "public/manifest.json",
          metadata: { manifestPath: "public/manifest.json", layerCount: 1 },
        },
        {
          id: "layer",
          kind: "layerImage",
          mediaType: "image/png",
          byteLength: png.length,
          sha256: "0".repeat(64),
          path: "layers/layer_000.png",
          metadata: { imagePath: "layers/layer_000.png" },
        },
      ],
    },
    blobs: [
      { id: "manifest", bytes },
      { id: "layer", bytes: png },
    ],
  };
}
beforeEach(() => {
  useEditorStore.setState({ project: null, projectV11: null, projectVersion: 0 });
  clearTextures();
  installCanvas();
});
afterEach(() => {
  removeDisplayOwner();
  removeDisplayOwner = () => {};
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearTextures();
});

it("stages through the actual native importer and ordinary serializer without global mutation or metadata stripping", async () => {
  const before = useEditorStore.getState();
  const bytes = await stageExchangeProposal(proposal(), ["manifest", "layer"]);
  const candidate = JSON.parse(new TextDecoder().decode(bytes));
  expect(candidate.version).toBe(9);
  expect(candidate.project.layers[0].importMetadata.seeThrough.psdLeafToken).toBe(
    "layer_000",
  );
  expect(candidate.project.layers[0].id).toBe(candidate.atlases[0].entries[0].layerId);
  const atlas = candidate.atlases[0],
    encoded = new Uint8Array(Buffer.from(atlas.image, "base64"));
  const created = await createNativePngDecoder();
  if (!created.ok) throw Error("decoder");
  try {
    const decoded = created.decoder.decode({
      bytes: encoded,
      expectedSha256: digest(encoded),
      width: atlas.width,
      height: atlas.height,
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const entry = atlas.entries[0],
        offset = (entry.y * atlas.width + entry.x) * 4;
      expect([...decoded.rgba.subarray(offset, offset + 4)]).toEqual([
        0x12, 0x34, 0x56, 0,
      ]);
    }
  } finally {
    created.decoder.dispose();
  }
  expect(useEditorStore.getState().project).toBe(before.project);
  expect(useEditorStore.getState().projectVersion).toBe(before.projectVersion);
  expect(getAllTextures().size).toBe(0);
});
it("rejects label ambiguity before importer decode and forbids PSD's mutating non-worker fallback", async () => {
  const input = proposal();
  input.manifest.artifacts.push({ ...input.manifest.artifacts[1]!, id: "other" });
  input.blobs.push({ id: "other", bytes: png });
  const decode = vi.fn();
  vi.stubGlobal("createImageBitmap", decode);
  await expect(
    stageExchangeProposal(input, ["manifest", "layer", "other"]),
  ).rejects.toThrow("SELECTION");
  expect(decode).not.toHaveBeenCalled();
  vi.stubGlobal("Worker", undefined);
  await expect(
    parsePsdAsync(new ArrayBuffer(8), "synthetic.psd", { requireWorker: true }),
  ).rejects.toThrow("Failed to load PSD file");
  expect(getAllTextures().size).toBe(0);
});
it("requires consent plus immutable project identity, even if undo did not increment the version", async () => {
  expect(() => captureExchangeConsent(false)).toThrow("CONSENT");
  const consent = captureExchangeConsent(true);
  useEditorStore.setState({ project: structuredClone(wire.project) });
  expect(useEditorStore.getState().projectVersion).toBe(consent.projectVersion);
  expect(() => assertExchangeConsent(consent)).toThrow("EDITOR_CHANGED");
});
it("requires a ready display owner before UI adoption, then uses the real PNG carrier and rejects a stale delayed reopen", async () => {
  const original = new TextEncoder().encode(fixture.documents[0]!.canonicalUtf8!);
  window.electronAPI.localExchange = vi.fn(async () => ({
    ok: true as const,
    value: { selection: { kind: "project-approved" }, bytes: original },
  }));
  const before = useEditorStore.getState();
  await expect(
    openExchangeCandidate("job", captureExchangeConsent(true)),
  ).rejects.toThrow("V11_MASK_RENDERER_UNAVAILABLE");
  expect(useEditorStore.getState().project).toBe(before.project);
  expect(getAllTextures().size).toBe(0);
  removeDisplayOwner = installProjectV11Display(() => {
    throw new Error("V11_MASK_RENDERER_UNAVAILABLE");
  });
  await expect(
    openExchangeCandidate("job", captureExchangeConsent(true)),
  ).rejects.toThrow("V11_MASK_RENDERER_UNAVAILABLE");
  expect(useEditorStore.getState().project).toBe(before.project);
  expect(getAllTextures().size).toBe(0);
  removeDisplayOwner();
  // Explicit CPU transaction seam, not a claim of a real mounted Canvas/GPU.
  removeDisplayOwner = installProjectV11Display(() => ({
    commit() {},
    rollback() {},
    finalize() {},
  }));
  await openExchangeCandidate("job", captureExchangeConsent(true));
  const first = useEditorStore.getState().project;
  expect(first?.layers[0]?.id).toBe(wire.project.layers[0].id);
  expect(getAllTextures().size).toBeGreaterThan(0);
  const captured = captureExchangeConsent(true);
  let resolve!: (value: any) => void;
  window.electronAPI.localExchange = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<ElectronAPI["localExchange"]>>>((done) => {
        resolve = done;
      }),
  );
  const pending = openExchangeCandidate("job", captured);
  const changed = structuredClone(first!);
  useEditorStore.setState({ project: changed });
  resolve({
    ok: true,
    value: { selection: { kind: "project-approved" }, bytes: original },
  });
  await expect(pending).rejects.toThrow("EDITOR_CHANGED");
  expect(useEditorStore.getState().project).toBe(changed);
});
