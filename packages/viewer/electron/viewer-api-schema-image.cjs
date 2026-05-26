const {
  MAX_PUBLIC_PROP_DIMENSION,
  MAX_PUBLIC_PROP_PIXEL_BYTES,
} = require("./viewer-api-schema-constants.cjs");

function ascii(bytes, start, end) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function readUint32Be(bytes, offset) {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function readUint32Le(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function readPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng || ascii(bytes, 12, 16) !== "IHDR") return null;
  return {
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20),
  };
}

function pngHasChunk(bytes, chunkType) {
  if (!readPngDimensions(bytes)) return false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    if (type === chunkType) return true;
    const next = offset + 12 + length;
    if (next <= offset || next > bytes.length) break;
    offset = next;
  }
  return false;
}

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const b = (index) => bytes[index] ?? 0;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (b(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b(offset + 1);
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (b(offset + 2) << 8) | b(offset + 3);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: (b(offset + 5) << 8) | b(offset + 6),
        width: (b(offset + 7) << 8) | b(offset + 8),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpHasAnimation(bytes) {
  if (
    bytes.length < 20 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return false;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, offset + 4);
    const size = readUint32Le(bytes, offset + 4);
    if (chunk === "ANIM" || chunk === "ANMF") return true;
    if (
      chunk === "VP8X" &&
      offset + 9 < bytes.length &&
      (bytes[offset + 8] & 0x02) !== 0
    ) {
      return true;
    }
    const next = offset + 8 + size + (size % 2);
    if (next <= offset || next > bytes.length) break;
    offset = next;
  }
  return false;
}

function readWebpDimensions(bytes) {
  if (bytes.length < 20) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") {
    return null;
  }
  const b = (index) => bytes[index] ?? 0;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + b(24) + (b(25) << 8) + (b(26) << 16),
      height: 1 + b(27) + (b(28) << 8) + (b(29) << 16),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: b(26) | (b(27) << 8),
      height: b(28) | (b(29) << 8),
    };
  }
  return null;
}

function assertPublicPropDimensions(dimensions) {
  if (!dimensions) {
    throw new Error("inline prop image header could not be inspected");
  }
  const { width, height } = dimensions;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PUBLIC_PROP_DIMENSION ||
    height > MAX_PUBLIC_PROP_DIMENSION
  ) {
    throw new Error("inline prop image dimensions exceed limit");
  }
  if (width * height * 4 > MAX_PUBLIC_PROP_PIXEL_BYTES) {
    throw new Error("inline prop decoded pixel buffer exceeds limit");
  }
}

function validateInlinePropImage(bytes, mimeType) {
  switch (mimeType) {
    case "image/png":
      if (pngHasChunk(bytes, "acTL")) {
        throw new Error("animated PNG props are not supported");
      }
      assertPublicPropDimensions(readPngDimensions(bytes));
      return;
    case "image/jpeg":
      assertPublicPropDimensions(readJpegDimensions(bytes));
      return;
    case "image/webp":
      if (webpHasAnimation(bytes)) {
        throw new Error("animated WebP props are not supported");
      }
      assertPublicPropDimensions(readWebpDimensions(bytes));
      return;
    default:
      throw new Error("unsupported inline prop MIME type");
  }
}

module.exports = {
  validateInlinePropImage,
};
