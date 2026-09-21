import { createHash } from "node:crypto";
import { migrateLegacyToEmbeddedRoundTripV11 } from "@vivi2d/model/internal/project-format-v11";
import { createNativePngDecoder } from "@vivi2d/runtime-wasm/internal/png-rgba8-v1";
import { describe, expect, it } from "vitest";
import manifest from "../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";
import { validateProjectV11WithNativePng } from "../project-v11-native-png";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const utf8 = (value: string) => new TextEncoder().encode(value);
const core = manifest.documents[0]!;

describe("Project wrapper connected to actual Rust PNG WASM", () => {
  it("keeps sequential atlas pixels separate and exposes none on a later atlas failure", async () => {
    const source = JSON.parse(core.inputUtf8);
    const mesh = structuredClone(source.project.layers[0].children[1]);
    mesh.id = "mesh-second";
    source.project.layers[0].children.push(mesh);
    const second = structuredClone(source.atlases[0]);
    second.id = "atlas-second";
    second.entries[0].layerId = mesh.id;
    source.atlases.push(second);
    const valid = await validateProjectV11WithNativePng(
      utf8(JSON.stringify(source)),
      sha256,
    );
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.images).toHaveLength(2);
    const original = Array.from(valid.images[1]!.rgba);
    expect(valid.images[0]!.rgba.buffer).not.toBe(valid.images[1]!.rgba.buffer);
    valid.images[0]!.rgba.fill(255);
    expect(Array.from(valid.images[1]!.rgba)).toEqual(original);
    second.image = "AQID";
    const failed = await validateProjectV11WithNativePng(
      utf8(JSON.stringify(source)),
      sha256,
    );
    expect(failed).toMatchObject({
      ok: false,
      code: "PROJECT_PNG_MALFORMED",
      path: "/atlases/1/image",
    });
    expect(failed).not.toHaveProperty("images");
  });

  it("retains owned pixels only after full Project success; all 32 stricter policy results stay distinct", async () => {
    for (const fixture of manifest.pngCases) {
      const source = JSON.parse(core.inputUtf8);
      source.atlases[0].image = fixture.base64;
      source.atlases[0].width = fixture.width;
      source.atlases[0].height = fixture.height;
      source.atlases[0].entries[0].width = fixture.width;
      source.atlases[0].entries[0].height = fixture.height;
      const result = await validateProjectV11WithNativePng(
        utf8(JSON.stringify(source)),
        sha256,
      );
      if (fixture.project.code === "ok") {
        expect(result.ok, fixture.id).toBe(true);
        if (!result.ok) continue;
        expect(result.images).toHaveLength(1);
        expect(result.images[0]!.sha256).toBe(fixture.sha256);
        expect(Buffer.from(result.images[0]!.rgba).toString("hex")).toBe(
          fixture.native.rgbaHex,
        );
      } else {
        expect(result, fixture.id).toMatchObject({
          ok: false,
          code: fixture.project.code,
        });
        expect(result).not.toHaveProperty("images");
      }
    }
  });

  it("uses real native validation for all three existing complete document operations", async () => {
    for (const fixture of manifest.documents) {
      let canonical = fixture.inputUtf8;
      if (fixture.operation === "migrate") {
        const initialized = await createNativePngDecoder();
        if (!initialized.ok) throw new Error("native PNG init failed");
        try {
          const migrated = await migrateLegacyToEmbeddedRoundTripV11(
            utf8(canonical),
            fixture.documentId,
            {
              sha256,
              async verifyPng(bytes, width, height) {
                const decoded = initialized.decoder.decode({
                  bytes,
                  expectedSha256: new Uint8Array(Buffer.from(sha256(bytes), "hex")),
                  width,
                  height,
                });
                if (!decoded.ok) throw new Error("native fixture rejected");
                return "ok";
              },
            },
          );
          expect(migrated.ok, fixture.id).toBe(true);
          if (!migrated.ok) continue;
          canonical = new TextDecoder().decode(migrated.canonicalUtf8);
        } finally {
          initialized.decoder.dispose();
        }
      }
      const result = await validateProjectV11WithNativePng(utf8(canonical), sha256);
      expect(result.ok, fixture.id).toBe(true);
      if (!result.ok) continue;
      expect(new TextDecoder().decode(result.canonicalUtf8)).toBe(fixture.canonicalUtf8);
      expect(result.documentId).toBe(fixture.documentId);
      expect(result.images.map((image) => image.sha256)).toEqual(fixture.pngSha256s);
    }
  });

  it("snapshots Buffer input before an asynchronous hash and rejects a mutating SHA port", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const input = Buffer.from(core.inputUtf8);
    const operation = validateProjectV11WithNativePng(input, async (bytes) => {
      await pending;
      return sha256(bytes);
    });
    input.fill(0);
    release();
    expect((await operation).ok).toBe(true);
    const result = await validateProjectV11WithNativePng(
      utf8(core.inputUtf8),
      (bytes) => {
        const digest = sha256(bytes);
        bytes.fill(0);
        return digest;
      },
    );
    expect(result).toMatchObject({ ok: false, code: "PROJECT_INTERNAL" });
    expect(result).not.toHaveProperty("images");
  });
});
