import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import manifest from "../../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { createNativePngDecoder } from "../internal/png-rgba8-v1";

const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
const rawDigest = (hex: string) => new Uint8Array(Buffer.from(hex, "hex"));

describe("real Rust PNG WASM port", () => {
  it("executes the unchanged 32 native witnesses and owns exact successful pixels", async () => {
    const initialized = await createNativePngDecoder();
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;
    const decoder = initialized.decoder;
    const statuses: Record<string, number> = {
      unsupported: 2,
      malformed: 3,
      limit: 4,
      dimension: 5,
      hash: 6,
    };
    const retained: Uint8Array[] = [];
    try {
      expect(manifest.pngCases).toHaveLength(32);
      for (const fixture of manifest.pngCases) {
        const result = decoder.decode({
          bytes: bytes(fixture.base64),
          expectedSha256: rawDigest(fixture.sha256),
          width: fixture.width,
          height: fixture.height,
        });
        if (fixture.native.status === "ok") {
          expect(result.ok, fixture.id).toBe(true);
          if (!result.ok) continue;
          expect(result.profile).toBe("vivi2d.png.rgba8.v1");
          expect([result.width, result.height, result.rowStride]).toEqual([
            fixture.width,
            fixture.height,
            fixture.width * 4,
          ]);
          expect(Buffer.from(result.rgba).toString("hex"), fixture.id).toBe(
            fixture.native.rgbaHex,
          );
          retained.push(result.rgba);
        } else {
          expect(result, fixture.id).toEqual({
            ok: false,
            kind: "png",
            status: statuses[fixture.native.status],
          });
        }
      }
      const first = retained[0]!;
      const expectedFirst = Buffer.from(first).toString("hex");
      decoder.dispose();
      expect(Buffer.from(first).toString("hex")).toBe(expectedFirst);
    } finally {
      decoder.dispose();
    }
  });

  it("checks SHA before malformed content/dimensions and can decode again after failure", async () => {
    const initialized = await createNativePngDecoder();
    if (!initialized.ok) throw new Error("native PNG init failed");
    const decoder = initialized.decoder;
    try {
      const malformed = new Uint8Array([1, 2, 3]);
      expect(
        decoder.decode({
          bytes: malformed,
          expectedSha256: new Uint8Array(32),
          width: 0,
          height: 0,
        }),
      ).toEqual({ ok: false, kind: "png", status: 6 });
      expect(
        decoder.decode({
          bytes: malformed,
          expectedSha256: createHash("sha256").update(malformed).digest(),
          width: 0,
          height: 0,
        }),
      ).toEqual({ ok: false, kind: "png", status: 3 });
      const fixture = manifest.pngCases[0]!;
      const padded = Buffer.concat([
        Buffer.from([77]),
        Buffer.from(fixture.base64, "base64"),
        Buffer.from([88]),
      ]);
      const result = decoder.decode({
        bytes: padded.subarray(1, -1),
        expectedSha256: rawDigest(fixture.sha256),
        width: fixture.width,
        height: fixture.height,
      });
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(Buffer.from(result.rgba).toString("hex")).toBe(fixture.native.rgbaHex);
    } finally {
      decoder.dispose();
    }
  });
});
