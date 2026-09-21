import {
  type EmbeddedRoundTripResult,
  PROJECT_FORMAT_V11_JSON_LIMITS,
  type Sha256V11,
  validateEmbeddedRoundTripV11,
} from "@vivi2d/model/internal/project-format-v11";
import {
  createNativePngDecoder,
  type NativePngDecoder,
} from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";

export interface NativeProjectPng {
  readonly sha256: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly rowStride: number;
  readonly rgba: Uint8Array<ArrayBuffer>;
}
export type NativeProjectValidation =
  | Exclude<EmbeddedRoundTripResult, { ok: true }>
  | (Extract<EmbeddedRoundTripResult, { ok: true }> & {
      /** Atlas order. Ownership transfers only after the complete Project succeeds. */
      images: readonly NativeProjectPng[];
    });

/** One operation, one private native decoder; no cross-document image cache. */
export async function validateProjectV11WithNativePng(
  input: Uint8Array,
  sha256: Sha256V11,
): Promise<NativeProjectValidation> {
  let decoder: NativePngDecoder | undefined;
  const images: NativeProjectPng[] = [];
  try {
    if (!(input instanceof Uint8Array)) {
      return { ok: false, code: "PROJECT_CARRIER_INVALID", path: "" };
    }
    if (input.byteLength > PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes) {
      return { ok: false, code: "PROJECT_LIMIT_EXCEEDED", path: "" };
    }
    // Buffer.slice aliases. Retain the actual invocation's bytes before any await.
    const source = new Uint8Array(input);
    const result = await validateEmbeddedRoundTripV11(source, {
      sha256,
      async verifyPng(bytes, width, height) {
        const owned = new Uint8Array(bytes);
        const hashingInput = new Uint8Array(owned);
        const digest = await sha256(hashingInput);
        if (
          hashingInput.byteLength !== owned.byteLength ||
          hashingInput.some((value, index) => value !== owned[index]) ||
          typeof digest !== "string" ||
          !/^[0-9a-f]{64}$/i.test(digest)
        ) {
          throw new Error("Project PNG verification failed");
        }
        const expectedSha256 = new Uint8Array(32);
        for (let index = 0; index < 32; index += 1) {
          expectedSha256[index] = Number.parseInt(
            digest.slice(index * 2, index * 2 + 2),
            16,
          );
        }
        if (!decoder) {
          const initialized = await createNativePngDecoder();
          if (!initialized.ok) throw new Error("Project PNG verification unavailable");
          decoder = initialized.decoder;
        }
        const decoded = decoder.decode({ bytes: owned, expectedSha256, width, height });
        if (!decoded.ok) {
          if (decoded.kind !== "png") throw new Error("Project PNG verification failed");
          switch (decoded.status) {
            case 2:
              return "unsupported";
            case 3:
              return "malformed";
            case 4:
              return "limit";
            case 5:
              return "dimension";
            default:
              throw new Error("Project PNG verification failed");
          }
        }
        images.push({
          sha256: digest.toLowerCase(),
          byteLength: owned.byteLength,
          width,
          height,
          rowStride: decoded.rowStride,
          rgba: decoded.rgba,
        });
        return "ok";
      },
    });
    if (!result.ok) return result;
    // Project's stricter PNG policy and ordinary serialize/reparse have completed.
    return { ...result, images };
  } catch {
    return { ok: false, code: "PROJECT_INTERNAL", path: "" };
  } finally {
    decoder?.dispose();
  }
}
