export function normalizeToRgba8(
  src: Uint8ClampedArray | Uint8Array | Uint16Array | Float32Array,
): Uint8ClampedArray {
  if (src instanceof Uint8ClampedArray) return src;
  const dst = new Uint8ClampedArray(src.length);
  if (src instanceof Float32Array) {
    for (let i = 0, size = src.length; i < size; i += 4) {
      dst[i + 0] = Math.round(src[i + 0]! ** (1.0 / 2.2) * 255);
      dst[i + 1] = Math.round(src[i + 1]! ** (1.0 / 2.2) * 255);
      dst[i + 2] = Math.round(src[i + 2]! ** (1.0 / 2.2) * 255);
      dst[i + 3] = Math.round(src[i + 3]! * 255);
    }
    return dst;
  }
  const shift = src instanceof Uint16Array ? 8 : 0;
  for (let i = 0, size = src.length; i < size; i++) {
    dst[i] = src[i]! >>> shift;
  }
  return dst;
}
