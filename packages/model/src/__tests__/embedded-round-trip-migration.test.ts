import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MODEL_HIGH_SIGNAL_STRING_MARKERS } from "../generated/private-local-motion-markers";
import {
  type EmbeddedRoundTripPorts,
  forkEmbeddedRoundTripV11,
  migrateLegacyToEmbeddedRoundTripV11,
} from "../internal/project-format-v11";
import { parseViviFile } from "../project-parser";

const manifest = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "tests/conformance/project-embedded-round-trip-v11/manifest.json",
    ),
    "utf8",
  ),
);
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const bytes = (value: string) => new TextEncoder().encode(value);
const ID = "123e4567-e89b-42d3-a456-426614174000",
  NEW_ID = "123e4567-e89b-42d3-a456-426614174001";
function ports() {
  return {
    sha256: (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
    verifyPng: vi.fn(async (input: Uint8Array, width: number, height: number) => {
      const sha = createHash("sha256").update(input).digest("hex");
      const row = manifest.pngCases.find(
        (row: { sha256: string; width: number; height: number }) =>
          row.sha256 === sha && row.width === width && row.height === height,
      );
      if (!row || !Buffer.from(input).equals(Buffer.from(row.base64, "base64")))
        throw new Error("unbound fixture");
      return row.native.status as Awaited<
        ReturnType<EmbeddedRoundTripPorts["verifyPng"]>
      >;
    }),
  };
}
const legacy = () =>
  JSON.parse(
    manifest.documents.find((row: { id: string }) => row.id === "core-v9-migration")
      .inputUtf8,
  );

describe("explicit opt-in legacy migration and fork", () => {
  it("migrates v9/v10 deterministically using writer defaults, preserving nested IDs and source", async () => {
    for (const vector of manifest.documents.filter(
      (row: { operation: string }) => row.operation === "migrate",
    )) {
      const input = bytes(vector.inputUtf8),
        original = input.slice(),
        port = ports();
      const result = await migrateLegacyToEmbeddedRoundTripV11(
        input,
        vector.documentId,
        port,
      );
      expect(result.ok, vector.id).toBe(true);
      if (!result.ok) continue;
      expect(new TextDecoder().decode(result.canonicalUtf8)).toBe(vector.canonicalUtf8);
      expect(input).toEqual(original);
      expect(port.verifyPng).toHaveBeenCalledTimes(1);
      expect(
        await migrateLegacyToEmbeddedRoundTripV11(input, vector.documentId, ports()),
      ).toEqual(result);
      const other = await migrateLegacyToEmbeddedRoundTripV11(input, NEW_ID, ports());
      expect(other.ok).toBe(true);
      if (other.ok) {
        const output = JSON.parse(new TextDecoder().decode(other.canonicalUtf8));
        expect(output.documentId).toBe(NEW_ID);
        expect(output.atlases[0].id).toBe("atlas-0");
      }
    }
  });

  it("requires explicit legacy metadata while ordinary legacy loads retain their accepted set", async () => {
    for (const key of ["name", "width", "height"]) {
      const value = legacy();
      delete value.project[key];
      expect(() => parseViviFile(JSON.stringify(value))).not.toThrow();
      expect(
        await migrateLegacyToEmbeddedRoundTripV11(encode(value), ID, ports()),
      ).toEqual({
        ok: false,
        code: "PROJECT_PROFILE_UNSUPPORTED",
        path: `/project/${key}`,
      });
      value.project[key] = null;
      expect(
        await migrateLegacyToEmbeddedRoundTripV11(encode(value), ID, ports()),
      ).toEqual({ ok: false, code: "PROJECT_SCHEMA_INVALID", path: "" });
    }
    const value = legacy();
    delete value.project.name;
    delete value.project.width;
    delete value.project.height;
    expect(await migrateLegacyToEmbeddedRoundTripV11(encode(value), ID, ports())).toEqual(
      { ok: false, code: "PROJECT_PROFILE_UNSUPPORTED", path: "/project/name" },
    );
  });

  it("rejects original provenance before a legacy parser could strip it", async () => {
    const value = legacy();
    value.project.parameters[0].managedTag = "LOCAL_PROVENANCE";
    expect(await migrateLegacyToEmbeddedRoundTripV11(encode(value), ID, ports())).toEqual(
      { ok: false, code: "PROJECT_PROFILE_UNSUPPORTED", path: "/project/parameters/0" },
    );
    delete value.project.parameters[0].managedTag;
    value.version = 8;
    expect(
      (await migrateLegacyToEmbeddedRoundTripV11(encode(value), ID, ports())).ok,
    ).toBe(false);
  });

  it("retains the conditional public string guard without ambient TextEncoder", async () => {
    const cases = [9, 10].map((version) => {
      const value = legacy();
      value.version = version;
      value.project.name = `synthetic ${MODEL_HIGH_SIGNAL_STRING_MARKERS[0]}`;
      const unflagged = encode(value);
      expect(() => parseViviFile(JSON.stringify(value))).not.toThrow();
      value.profile = "publicProfileV1";
      expect(() => parseViviFile(JSON.stringify(value))).toThrow();
      return { unflagged, flagged: encode(value) };
    });
    const originalEncoder = globalThis.TextEncoder;
    vi.stubGlobal("TextEncoder", undefined);
    try {
      for (const { unflagged, flagged } of cases) {
        const rejectedPorts = ports();
        expect(
          await migrateLegacyToEmbeddedRoundTripV11(flagged, ID, rejectedPorts),
        ).toEqual({ ok: false, code: "PROJECT_SEMANTIC_INVALID", path: "" });
        expect(rejectedPorts.verifyPng).not.toHaveBeenCalled();
        expect(
          (await migrateLegacyToEmbeddedRoundTripV11(unflagged, ID, ports())).ok,
        ).toBe(true);
      }
    } finally {
      vi.stubGlobal("TextEncoder", originalEncoder);
    }
  });

  it("validates the UUID argument before input and equality only after full source validation", async () => {
    const malformed = bytes("{");
    for (const operation of [
      migrateLegacyToEmbeddedRoundTripV11,
      forkEmbeddedRoundTripV11,
    ]) {
      expect(await operation(malformed, "INVALID_UUID", ports())).toEqual({
        ok: false,
        code: "PROJECT_PROFILE_UNSUPPORTED",
        path: "",
      });
      expect(await operation(malformed, NEW_ID, ports())).toEqual({
        ok: false,
        code: "PROJECT_JSON_INVALID",
        path: "",
      });
    }
    const source = JSON.parse(manifest.documents[0].inputUtf8);
    source.atlases[0].image = manifest.pngCases.find(
      (row: { id: string }) => row.id === "frozen-malformed-zlib",
    ).base64;
    expect(await forkEmbeddedRoundTripV11(encode(source), ID, ports())).toEqual({
      ok: false,
      code: "PROJECT_PNG_MALFORMED",
      path: "/atlases/0/image",
    });
    const port = ports();
    expect(
      await forkEmbeddedRoundTripV11(bytes(manifest.documents[0].inputUtf8), ID, port),
    ).toEqual({ ok: false, code: "PROJECT_PROFILE_UNSUPPORTED", path: "" });
    expect(port.verifyPng).toHaveBeenCalledTimes(1);
  });

  it("forks only document identity and preserves normal local-duplicate identity", async () => {
    const port = ports(),
      result = await forkEmbeddedRoundTripV11(
        bytes(manifest.documents[0].inputUtf8),
        NEW_ID,
        port,
      );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fork = JSON.parse(new TextDecoder().decode(result.canonicalUtf8)),
      expected = JSON.parse(manifest.documents[0].canonicalUtf8);
    expected.documentId = NEW_ID;
    expect(fork).toEqual(expected);
    expect(result.documentId).toBe(NEW_ID);
    expect(port.verifyPng).toHaveBeenCalledTimes(2);
  });
});
