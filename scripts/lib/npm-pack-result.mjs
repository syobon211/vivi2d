import fs from "node:fs";

export function readSinglePackEntry(file) {
  const parsed = JSON.parse(readTextFile(file));
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`${file} must contain exactly one npm pack result.`);
  }
  return parsed[0];
}

function readTextFile(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (looksLikeUtf16LeWithoutBom(bytes)) {
    return bytes.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

function looksLikeUtf16LeWithoutBom(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 128));
  if (sample.length < 4) return false;
  let oddNulls = 0;
  let evenNulls = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }
  return oddNulls >= Math.max(2, Math.floor(sample.length / 4)) && evenNulls === 0;
}
