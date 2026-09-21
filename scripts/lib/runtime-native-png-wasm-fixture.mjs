import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createDeflate } from "node:zlib";

// Test data only: no decoder, no filesystem output and no full inflated fixture.
// A private ancillary chunk pads one valid image to the exact encoded-byte cap.
// The public PNG decoder accepts that chunk; Project's stricter policy is separate.
export async function createMaxPngWasmFixture() {
  const width = 8192;
  const height = 8192;
  const pixel = Buffer.from([0x12, 0x34, 0x56, 0]);
  const row = Buffer.alloc(1 + width * 4);
  row.subarray(1).fill(pixel);
  const rgbaHash = createHash("sha256");
  const deflater = createDeflate({ level: 9 });
  const chunks = [];
  const maxBytes = 67_108_864;
  let total = 0;
  let exceeded = false;
  deflater.on("data", (chunk) => {
    total += chunk.length;
    if (total > maxBytes) {
      exceeded = true;
      return;
    }
    chunks.push(chunk);
  });
  const completed = once(deflater, "end");
  for (let y = 0; y < height; y++) {
    rgbaHash.update(row.subarray(1));
    if (!deflater.write(row)) await once(deflater, "drain");
  }
  deflater.end();
  await completed;
  if (exceeded) throw new Error("Compressed PNG fixture exceeds bound");
  const compressed = Buffer.concat(chunks);
  const bytes = Buffer.alloc(67_108_864);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  let offset = putChunk(bytes, 8, "IHDR", ihdr);
  const paddingLength = bytes.length - offset - 12 - (compressed.length + 12) - 12;
  assert(paddingLength > 0);
  // Avoid a second 64 MiB padding allocation: the destination is already zeroed.
  bytes.writeUInt32BE(paddingLength, offset);
  bytes.write("vpAg", offset + 4, "ascii");
  const paddingEnd = offset + 8 + paddingLength;
  bytes.writeUInt32BE(crc32(bytes.subarray(offset + 4, paddingEnd)), paddingEnd);
  offset = paddingEnd + 4;
  offset = putChunk(bytes, offset, "IDAT", compressed);
  offset = putChunk(bytes, offset, "IEND", Buffer.alloc(0));
  assert.equal(offset, bytes.length);
  return {
    id: "exact-64mib-input-8192-square-rgba",
    bytes,
    digest: createHash("sha256").update(bytes).digest(),
    width,
    height,
    rgbaBytes: width * height * 4,
    rgbaSha256: rgbaHash.digest("hex"),
    pixel,
    paddingBytes: paddingLength,
    compressedBytes: compressed.length,
  };
}

function putChunk(destination, offset, type, data) {
  destination.writeUInt32BE(data.length, offset);
  destination.write(type, offset + 4, "ascii");
  data.copy(destination, offset + 8);
  const end = offset + 8 + data.length;
  destination.writeUInt32BE(crc32(destination.subarray(offset + 4, end)), end);
  return end + 4;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
