import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication } from "playwright";
import { expect, test } from "../fixtures";
import { clickFileMenuItem } from "../helpers/operations";


let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-glb-rt-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function mockExportDir(app: ElectronApplication, dir: string) {
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [d],
    });
  }, dir);
}


interface GlbParsed {
  version: number;
  totalLength: number;
  json: {
    asset?: { version?: string; generator?: string };
    scene?: number;
    scenes?: Array<{ name?: string; nodes?: number[] }>;
    nodes?: Array<{
      name?: string;
      mesh?: number;
      translation?: [number, number, number];
      children?: number[];
    }>;
    meshes?: Array<{
      name?: string;
      primitives: Array<{
        attributes: Record<string, number>;
        indices?: number;
        material?: number;
      }>;
    }>;
    accessors?: Array<{
      bufferView: number;
      byteOffset?: number;
      componentType: number;
      count: number;
      type: string;
    }>;
    bufferViews?: Array<{
      buffer: number;
      byteOffset?: number;
      byteLength: number;
    }>;
    buffers?: Array<{ byteLength: number; uri?: string }>;
    materials?: Array<unknown>;
    images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
    textures?: Array<{ source?: number }>;
  };
  binLength: number;
}

function parseGlb(buf: Buffer): GlbParsed {
  // 12-byte header: magic(4) + version(4) + totalLength(4)
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const version = buf.readUInt32LE(4);
  const totalLength = buf.readUInt32LE(8);
  expect(totalLength).toBe(buf.length);

  // Chunk 0 (JSON): length(4) + type(4) + data
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a); // "JSON"
  const jsonBytes = buf.subarray(20, 20 + jsonLen);
  const json = JSON.parse(jsonBytes.toString("utf-8"));

  // Chunk 1 (BIN, optional): length(4) + type(4) + data
  let binLength = 0;
  const binStart = 20 + jsonLen;
  if (binStart < buf.length) {
    binLength = buf.readUInt32LE(binStart);
    const binType = buf.readUInt32LE(binStart + 4);
    expect(binType).toBe(0x004e4942); // "BIN\0"
  }

  return { version, totalLength, json, binLength };
}


test("エクスポートした .glb は 2 チャンク構造 (JSON + BIN) として再パースできる", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"));
  expect(glbFile).toBeTruthy();
  const buf = fs.readFileSync(path.join(tmpDir, glbFile as string));

  const parsed = parseGlb(buf);

  expect(parsed.version).toBe(2);
  expect(parsed.json.asset?.version).toBe("2.0");
  expect(parsed.binLength).toBeGreaterThan(0);

  const declaredTotal =
    12 +
    8 +
    Math.ceil(buf.readUInt32LE(12) / 1) + // JSON chunk payload length
    8 +
    parsed.binLength;
  expect(declaredTotal).toBe(parsed.totalLength);
});

test("accessor / bufferView / buffer の参照が閉じている", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"));
  const buf = fs.readFileSync(path.join(tmpDir, glbFile as string));
  const { json, binLength } = parseGlb(buf);

  const buffers = json.buffers ?? [];
  const bufferViews = json.bufferViews ?? [];
  const accessors = json.accessors ?? [];

  expect(buffers.length).toBeGreaterThan(0);
  expect(bufferViews.length).toBeGreaterThan(0);
  expect(accessors.length).toBeGreaterThan(0);

  expect(Math.abs(buffers[0]!.byteLength - binLength)).toBeLessThanOrEqual(3);

  for (const [i, bv] of bufferViews.entries()) {
    expect(bv.buffer, `bufferViews[${i}].buffer が未定義`).toBeGreaterThanOrEqual(0);
    expect(bv.buffer).toBeLessThan(buffers.length);
    const offset = bv.byteOffset ?? 0;
    expect(
      offset + bv.byteLength,
      `bufferViews[${i}] が buffer 範囲を超過`,
    ).toBeLessThanOrEqual(buffers[bv.buffer]!.byteLength);
  }

  for (const [i, ac] of accessors.entries()) {
    expect(ac.bufferView, `accessors[${i}].bufferView が未定義`).toBeGreaterThanOrEqual(
      0,
    );
    expect(ac.bufferView).toBeLessThan(bufferViews.length);
    expect(ac.count, `accessors[${i}].count が 0 以下`).toBeGreaterThan(0);
    expect(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"]).toContain(ac.type);
  }
});

test("すべての mesh.primitive が POSITION 属性と有効な material を持つ", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"));
  const buf = fs.readFileSync(path.join(tmpDir, glbFile as string));
  const { json } = parseGlb(buf);

  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const materials = json.materials ?? [];

  expect(meshes.length).toBeGreaterThan(0);

  for (const [mi, mesh] of meshes.entries()) {
    expect(mesh.primitives.length, `meshes[${mi}] に primitive が無い`).toBeGreaterThan(
      0,
    );

    for (const [pi, prim] of mesh.primitives.entries()) {
      expect(
        prim.attributes.POSITION,
        `meshes[${mi}].primitives[${pi}] に POSITION が無い`,
      ).toBeGreaterThanOrEqual(0);
      expect(prim.attributes.POSITION).toBeLessThan(accessors.length);

      const posAcc = accessors[prim.attributes.POSITION!]!;
      expect(posAcc.type).toBe("VEC3");
      expect(posAcc.componentType).toBe(5126); // FLOAT

      const uvIdx = prim.attributes.TEXCOORD_0;
      if (uvIdx !== undefined) {
        expect(uvIdx).toBeLessThan(accessors.length);
        expect(accessors[uvIdx]!.type).toBe("VEC2");
      }

      if (prim.indices !== undefined) {
        expect(prim.indices).toBeLessThan(accessors.length);
        expect(accessors[prim.indices]!.type).toBe("SCALAR");
      }

      if (prim.material !== undefined) {
        expect(prim.material).toBeLessThan(materials.length);
      }
    }
  }
});

test("埋め込みテクスチャが images → bufferView 参照経由でロード可能", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"));
  const buf = fs.readFileSync(path.join(tmpDir, glbFile as string));
  const { json } = parseGlb(buf);

  const images = json.images ?? [];
  const textures = json.textures ?? [];
  const bufferViews = json.bufferViews ?? [];

  expect(images.length).toBeGreaterThanOrEqual(1);
  expect(textures.length).toBeGreaterThanOrEqual(1);

  for (const [i, img] of images.entries()) {
    expect(
      img.bufferView,
      `images[${i}] に bufferView 参照が無い`,
    ).toBeGreaterThanOrEqual(0);
    expect(img.bufferView!).toBeLessThan(bufferViews.length);
    expect(img.mimeType).toMatch(/^image\/(png|jpeg)$/);
  }

  for (const [i, tex] of textures.entries()) {
    expect(tex.source, `textures[${i}].source が未定義`).toBeGreaterThanOrEqual(0);
    expect(tex.source!).toBeLessThan(images.length);
  }
});

test("BIN チャンクに実際のメッシュ頂点データが含まれる（形状再現）", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await mockExportDir(app, tmpDir);
  await clickFileMenuItem(window, "Blender (.glb)");

  await expect(window.locator(".notification-info")).toBeVisible({
    timeout: 10_000,
  });

  const glbFile = fs.readdirSync(tmpDir).find((f) => f.endsWith(".glb"));
  const buf = fs.readFileSync(path.join(tmpDir, glbFile as string));
  const { json, binLength } = parseGlb(buf);

  const jsonLen = buf.readUInt32LE(12);
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + binLength);

  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];

  const firstMesh = meshes[0];
  expect(firstMesh).toBeDefined();
  const posAccIdx = firstMesh!.primitives[0]!.attributes.POSITION!;
  const posAcc = accessors[posAccIdx]!;
  const posBv = bufferViews[posAcc.bufferView]!;

  const byteOffset = (posBv.byteOffset ?? 0) + (posAcc.byteOffset ?? 0);
  const vertexCount = posAcc.count;

  expect(posBv.byteLength).toBeGreaterThanOrEqual(vertexCount * 12);

  const view = new DataView(bin.buffer, bin.byteOffset + byteOffset, vertexCount * 12);
  let hasNonZero = false;
  for (let i = 0; i < Math.min(vertexCount, 10); i++) {
    const x = view.getFloat32(i * 12, true);
    const y = view.getFloat32(i * 12 + 4, true);
    const z = view.getFloat32(i * 12 + 8, true);
    if (x !== 0 || y !== 0 || z !== 0) {
      hasNonZero = true;
      break;
    }
  }
  expect(hasNonZero, "BIN に全ゼロ座標しか無い = メッシュ転写に失敗").toBe(true);
});
