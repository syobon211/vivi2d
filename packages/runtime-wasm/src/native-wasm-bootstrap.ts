/** Shared code loading only; callers own their separate mutable instances. */
export function createEmbeddedWasmLoader(
  base64: string,
): () => Promise<WebAssembly.Instance> {
  let compiled: Promise<WebAssembly.Module> | undefined;
  return async () => {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly is not available in this host");
    }
    compiled ??= WebAssembly.compile(decodeBase64ToBytes(base64)).catch(
      (error: unknown) => {
        compiled = undefined;
        throw error;
      },
    );
    return WebAssembly.instantiate(await compiled);
  };
}

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const maybeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: { from(value: string, encoding: "base64"): Uint8Array };
    }
  ).Buffer;
  if (maybeBuffer) return Uint8Array.from(maybeBuffer.from(base64, "base64"));
  throw new Error("base64 decoding is not available in this host");
}
