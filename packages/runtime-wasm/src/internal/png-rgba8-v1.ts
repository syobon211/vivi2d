import { VIVI_RUNTIME_NATIVE_PNG_WASM_BASE64 } from "../native-png-wasm-bytes";
import { createEmbeddedWasmLoader } from "../native-wasm-bootstrap";

export type PngStatus = 1 | 2 | 3 | 4 | 5 | 6;
export type PngFailure = { ok: false; kind: "png"; status: PngStatus };
export type PngBridgeFailure = {
  ok: false;
  kind: "bridge";
  code: "unavailable" | "internal" | "disposed";
};
export type NativePngResult =
  | PngFailure
  | PngBridgeFailure
  | {
      ok: true;
      profile: "vivi2d.png.rgba8.v1";
      width: number;
      height: number;
      rowStride: number;
      rgba: Uint8Array<ArrayBuffer>;
    };
export interface NativePngDecoder {
  decode(input: {
    bytes: Uint8Array;
    expectedSha256: Uint8Array;
    width: number;
    height: number;
  }): NativePngResult;
  dispose(): void;
}

const INPUT_LIMIT = 64 * 1024 * 1024;
const RGBA_LIMIT = 256 * 1024 * 1024;
const loadPngWasm = createEmbeddedWasmLoader(VIVI_RUNTIME_NATIVE_PNG_WASM_BASE64);
const bridgeFailure = (code: PngBridgeFailure["code"]): PngBridgeFailure => ({
  ok: false,
  kind: "bridge",
  code,
});
const pngFailure = (status: PngStatus): PngFailure => ({
  ok: false,
  kind: "png",
  status,
});
const u32 = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 0xffff_ffff;

interface PngExports {
  memory: WebAssembly.Memory;
  vivi_wasm_alloc(length: number): number;
  vivi_wasm_free(pointer: number, length: number): void;
  vivi_wasm_output_len(): number;
  vivi_wasm_png_abi_version(): number;
  vivi_wasm_png_decode_rgba8(
    p: number,
    n: number,
    d: number,
    dn: number,
    w: number,
    h: number,
  ): number;
  vivi_wasm_png_output_ptr(): number;
  vivi_wasm_png_release_output(): void;
}

function readExports(instance: WebAssembly.Instance): PngExports {
  const e = instance.exports;
  if (!(e.memory instanceof WebAssembly.Memory))
    throw new Error("PNG memory unavailable");
  for (const name of [
    "vivi_wasm_alloc",
    "vivi_wasm_free",
    "vivi_wasm_output_len",
    "vivi_wasm_png_abi_version",
    "vivi_wasm_png_decode_rgba8",
    "vivi_wasm_png_output_ptr",
    "vivi_wasm_png_release_output",
  ]) {
    if (typeof e[name] !== "function") throw new Error("PNG export unavailable");
  }
  const exports = e as unknown as PngExports;
  if (exports.vivi_wasm_png_abi_version() !== 1) throw new Error("PNG ABI unavailable");
  return exports;
}

function interval(memory: WebAssembly.Memory, pointer: unknown, length: number): number {
  if (
    !u32(pointer) ||
    pointer === 0 ||
    !u32(length) ||
    pointer + length > memory.buffer.byteLength
  )
    throw new Error("PNG range invalid");
  return pointer;
}

/** No fallback, borrowed pixels, runtime model or raw export escapes this port. */
export async function createNativePngDecoder(): Promise<
  { ok: true; decoder: NativePngDecoder } | PngBridgeFailure
> {
  let current: PngExports | undefined;
  try {
    current = readExports(await loadPngWasm());
  } catch {
    return bridgeFailure("unavailable");
  }
  let busy = false;
  let disposed = false;
  const decoder: NativePngDecoder = {
    dispose() {
      disposed = true;
      current = undefined;
    },
    decode(input) {
      if (disposed) return bridgeFailure("disposed");
      if (!current || busy) return bridgeFailure("internal");
      busy = true;
      const e = current;
      let upload = 0;
      let allocationSize = 0;
      let trapped = false;
      let nativeLimit = false;
      let retired = false;
      let cleanupFailed = false;
      let result: NativePngResult = bridgeFailure("internal");
      // An exception from ANY WASM export poisons the instance. In particular,
      // release/free must not be followed by another export after they trap.
      const invoke = <T>(call: () => T): T => {
        if (trapped) throw new Error("PNG instance retired");
        try {
          return call();
        } catch {
          trapped = true;
          throw new Error("PNG export failed");
        }
      };
      try {
        const bytes = input.bytes;
        const digest = input.expectedSha256;
        const width = input.width;
        const height = input.height;
        if (disposed || current !== e) throw new Error("PNG instance retired");
        if (
          !(bytes instanceof Uint8Array) ||
          !(digest instanceof Uint8Array) ||
          digest.byteLength !== 32 ||
          !u32(width) ||
          !u32(height)
        ) {
          result = pngFailure(1);
        } else if (bytes.byteLength > INPUT_LIMIT) {
          result = pngFailure(4);
        } else {
          // Own logical intervals, including Buffer/subarray inputs, before exports.
          const source = new Uint8Array(bytes);
          const expected = new Uint8Array(digest);
          allocationSize = source.byteLength + 32;
          const pointer = invoke(() => e.vivi_wasm_alloc(allocationSize));
          if (pointer === 0) {
            retired = true;
            throw new Error("PNG allocation failed");
          }
          upload = interval(e.memory, pointer, allocationSize);
          const view = new Uint8Array(e.memory.buffer, upload, allocationSize);
          view.set(source);
          view.set(expected, source.byteLength);
          const status = invoke(() =>
            e.vivi_wasm_png_decode_rgba8(
              upload,
              source.byteLength,
              upload + source.byteLength,
              32,
              width,
              height,
            ),
          );
          if (!Number.isInteger(status) || status < 0 || status > 6) {
            retired = true;
            throw new Error("PNG status invalid");
          }
          if (status !== 0) {
            result = pngFailure(status as PngStatus);
            nativeLimit = status === 4;
            retired = nativeLimit;
          } else {
            const required = width * height * 4;
            const length = invoke(() => e.vivi_wasm_output_len());
            const output = invoke(() => e.vivi_wasm_png_output_ptr());
            if (
              !Number.isSafeInteger(required) ||
              required === 0 ||
              required > RGBA_LIMIT ||
              length !== required
            ) {
              retired = true;
              throw new Error("PNG output invalid");
            }
            interval(e.memory, output, length);
            // decode can grow memory: do not reuse the upload view here.
            const rgba = new Uint8Array(length);
            rgba.set(new Uint8Array(e.memory.buffer, output, length));
            result = {
              ok: true,
              profile: "vivi2d.png.rgba8.v1",
              width,
              height,
              rowStride: width * 4,
              rgba,
            };
          }
        }
      } catch {
        result = bridgeFailure("internal");
        retired = true;
      } finally {
        // PNG4 can represent native allocation failure, so discard its private
        // instance without any further exports, just as after a WASM trap.
        if (!trapped && !nativeLimit && upload !== 0) {
          try {
            invoke(() => e.vivi_wasm_png_release_output());
          } catch {
            cleanupFailed = true;
          }
          if (!trapped) {
            try {
              invoke(() => e.vivi_wasm_free(upload, allocationSize));
            } catch {
              cleanupFailed = true;
            }
          }
        }
        if (trapped || retired || cleanupFailed || disposed) current = undefined;
        busy = false;
      }
      if (trapped || cleanupFailed || disposed) return bridgeFailure("internal");
      return result;
    },
  };
  return { ok: true, decoder };
}
