import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type EmbeddedRoundTripPorts,
  validateEmbeddedRoundTripV11,
} from "../internal/project-format-v11";
import { checkCandidateProfile } from "../project-format-v11/embedded-round-trip-profile";

const manifestBytes = readFileSync(
  path.join(
    process.cwd(),
    "tests/conformance/project-embedded-round-trip-v11/manifest.json",
  ),
);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const core = () =>
  JSON.parse(
    manifest.documents.find((row: { id: string }) => row.id === "core-v11").inputUtf8,
  );

// Recorded outcomes ONLY. The separate Rust consumer supplies actual decode evidence.
function fixturePorts() {
  const verifyPng = vi.fn(async (bytes: Uint8Array, width: number, height: number) => {
    const digest = hash(bytes);
    const vector = manifest.pngCases.find(
      (row: { sha256: string; width: number; height: number }) =>
        row.sha256 === digest && row.width === width && row.height === height,
    );
    if (!vector || !Buffer.from(bytes).equals(Buffer.from(vector.base64, "base64")))
      throw new Error("Unbound synthetic bytes");
    return vector.native.status as Awaited<
      ReturnType<EmbeddedRoundTripPorts["verifyPng"]>
    >;
  });
  return { sha256: hash, verifyPng };
}

describe("embedded profile — recorded native outcomes, not a production PNG bridge", () => {
  it("pins the shared manifest and independently specified canonical document", () => {
    expect(manifestBytes.byteLength).toBe(29361);
    expect(hash(manifestBytes)).toBe(
      "d9803f48ac6911130d8baf36b605fc8ea9dee57bf8acbc01b4886c92788b79d4",
    );
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.pngCases).toHaveLength(32);
    for (const row of manifest.documents) {
      expect(hash(row.inputUtf8)).toBe(row.inputSha256);
      expect(hash(row.canonicalUtf8)).toBe(row.canonicalSha256);
      expect(
        row.pngCaseIds.map(
          (id: string) =>
            manifest.pngCases.find((png: { id: string }) => png.id === id).sha256,
        ),
      ).toEqual(row.pngSha256s);
    }
  });

  it("validates the nonempty core and a supported edit without rewriting IDs or image bytes", async () => {
    const document = core(),
      ports = fixturePorts();
    const result = await validateEmbeddedRoundTripV11(encode(document), ports);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new TextDecoder().decode(result.canonicalUtf8)).toBe(
      manifest.documents[0].canonicalUtf8,
    );
    expect(ports.verifyPng).toHaveBeenCalledTimes(1);
    const edited = JSON.parse(new TextDecoder().decode(result.canonicalUtf8));
    edited.project.layers[0].name = "Renamed group";
    const next = await validateEmbeddedRoundTripV11(encode(edited), fixturePorts());
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const saved = JSON.parse(new TextDecoder().decode(next.canonicalUtf8));
    expect(next.documentId).toBe(result.documentId);
    expect(saved.atlases).toEqual(document.atlases);
    expect(saved.project.layers[0].children).toEqual(document.project.layers[0].children);
    expect(saved.project.layers[0].name).toBe("Renamed group");
    expect(
      await validateEmbeddedRoundTripV11(result.canonicalUtf8, fixturePorts()),
    ).toEqual(result);
  });

  it("executes the real Project narrowing walk against all byte-bound recorded native outcomes", async () => {
    for (const vector of manifest.pngCases) {
      const document = core(),
        ports = fixturePorts();
      Object.assign(document.atlases[0], {
        image: vector.base64,
        width: vector.width,
        height: vector.height,
      });
      const result = await validateEmbeddedRoundTripV11(encode(document), ports);
      expect(ports.verifyPng, vector.id).toHaveBeenCalledTimes(1);
      expect(result.ok ? "ok" : result.code, vector.id).toBe(vector.project.code);
      if (!result.ok) expect(result.path, vector.id).toBe("/atlases/0/image");
    }
  });

  it("retains the ordinary writer's mask canonicalization and permits an atlas-free document", async () => {
    const document = core(),
      ports = fixturePorts();
    const target = document.project.layers[0].children[1];
    document.project.layers[0].children.push({ ...structuredClone(target), id: "mask" });
    document.atlases[0].entries.push({
      ...document.atlases[0].entries[0],
      layerId: "mask",
    });
    target.clipMasks = [{ layerId: "mask", invert: false }];
    const result = await validateEmbeddedRoundTripV11(encode(document), ports);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = JSON.parse(new TextDecoder().decode(result.canonicalUtf8));
    expect(saved.project.layers[0].children[1].clipMaskIds).toEqual(["mask"]);
    expect(saved.project.layers[0].children[1]).not.toHaveProperty("clipMasks");
    expect(saved.atlases).toEqual(document.atlases);

    const empty = core(),
      emptyPorts = fixturePorts();
    Object.assign(empty.project, {
      layers: [],
      parameters: [],
      skins: {},
      parameterBindings: [],
      ikControllers: [],
    });
    empty.atlases = [];
    expect((await validateEmbeddedRoundTripV11(encode(empty), emptyPorts)).ok).toBe(true);
    expect(emptyPorts.verifyPng).not.toHaveBeenCalled();
    expect(
      await validateEmbeddedRoundTripV11(encode(empty), {
        sha256: hash,
      } as EmbeddedRoundTripPorts),
    ).toEqual({ ok: false, code: "PROJECT_INTERNAL", path: "" });
  });

  it("rejects noncanonical base64 pad bits before the port, without changing the broad codec", async () => {
    const document = core(),
      ports = fixturePorts();
    const value = document.atlases[0].image as string;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    expect(value.endsWith("=")).toBe(true);
    document.atlases[0].image =
      value.slice(0, -2) +
      alphabet[alphabet.indexOf(value.charAt(value.length - 2)) + 1] +
      "=";
    expect(Buffer.from(document.atlases[0].image, "base64")).toEqual(
      Buffer.from(value, "base64"),
    );
    expect(await validateEmbeddedRoundTripV11(encode(document), ports)).toEqual({
      ok: false,
      code: "PROJECT_PNG_MALFORMED",
      path: "/atlases/0/image",
    });
    expect(ports.verifyPng).not.toHaveBeenCalled();
  });

  it("keeps carrier, JSON, schema, profile, semantic and PNG precedence redacted", async () => {
    const ports = fixturePorts(),
      secret = "DO_NOT_REPORT_THIS_KEY";
    const cases: [Uint8Array, string, string][] = [
      [new Uint8Array([0xef, 0xbb, 0xbf, 123]), "PROJECT_CARRIER_INVALID", ""],
      [new Uint8Array([0xff]), "PROJECT_CARRIER_INVALID", ""],
      [
        new TextEncoder().encode('{"version":11,"version":10}'),
        "PROJECT_JSON_INVALID",
        "",
      ],
      [
        new TextEncoder().encode('{"version":9007199254740993}'),
        "PROJECT_JSON_INVALID",
        "",
      ],
    ];
    let document = core();
    delete document.project.name;
    document.project.layers[0].managedTag = secret;
    cases.push([encode(document), "PROJECT_SCHEMA_INVALID", ""]);
    document = core();
    document.project.layers[0].managedTag = secret;
    document.project.skins["mesh-0"].weights[0][0].boneId = "missing";
    cases.push([encode(document), "PROJECT_PROFILE_UNSUPPORTED", "/project/layers/0"]);
    document = core();
    document.project.skins["mesh-0"].weights[0][0].boneId = "missing";
    document.atlases[0].image = "AA==";
    cases.push([encode(document), "PROJECT_SEMANTIC_INVALID", ""]);
    document = core();
    document.project.skins[secret] = document.project.skins["mesh-0"];
    document.project.skins[secret].managedTag = secret;
    cases.push([encode(document), "PROJECT_PROFILE_UNSUPPORTED", "/project/skins"]);
    for (const [input, code, path] of cases) {
      const result = await validateEmbeddedRoundTripV11(input, ports);
      expect(result).toEqual({ ok: false, code, path });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(ports.verifyPng).not.toHaveBeenCalled();
  });

  it("does not silently drop broader authoring state or unlisted empty fields", async () => {
    for (const mutate of [
      (doc: ReturnType<typeof core>) => {
        doc.requires = [];
      },
      (doc: ReturnType<typeof core>) => {
        doc.project.sourceKind = "psd";
      },
      (doc: ReturnType<typeof core>) => {
        doc.project.lipsyncConfig.mode = "rms";
      },
      (doc: ReturnType<typeof core>) => {
        doc.project.parameters[0].managedTag = "provenance";
      },
      (doc: ReturnType<typeof core>) => {
        doc.project.parameterBindings[0].bindingPoints = [];
      },
      (doc: ReturnType<typeof core>) => {
        doc.documentId = doc.documentId.toUpperCase();
      },
    ]) {
      const document = core(),
        ports = fixturePorts();
      mutate(document);
      const result = await validateEmbeddedRoundTripV11(encode(document), ports);
      expect(result.ok ? "ok" : result.code).toBe("PROJECT_PROFILE_UNSUPPORTED");
      expect(ports.verifyPng).not.toHaveBeenCalled();
    }
  });

  it("preflights every atlas before decoding the first, including aggregate RGBA", async () => {
    for (const dimension of [8193, 8192]) {
      const document = core(),
        ports = fixturePorts();
      document.atlases[0].image = "AA==";
      document.atlases.push({
        ...document.atlases[0],
        id: "later",
        width: dimension,
        height: 8192,
      });
      if (dimension === 8192) {
        document.atlases[0].width = 8192;
        document.atlases[0].height = 8192;
      }
      const result = await validateEmbeddedRoundTripV11(encode(document), ports);
      expect(result.ok ? "ok" : result.code).toBe("PROJECT_LIMIT_EXCEEDED");
      expect(ports.verifyPng).not.toHaveBeenCalled();
    }
  });

  it("checks compressed aggregate accounting without allocating five copies of a 16 MiB PNG", () => {
    // Exercise the actual profile preflight on a shared immutable spelling; not full JSON/decode evidence.
    const document = core(),
      spelling = `${"A".repeat(22369620)}AA==`;
    document.atlases = Array.from({ length: 5 }, (_, index) => ({
      ...document.atlases[0],
      id: `atlas-${index}`,
      image: spelling,
    }));
    let failure: unknown;
    try {
      checkCandidateProfile(document);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "PROJECT_LIMIT_EXCEEDED", path: "/atlases" });
  });

  it("owns input across async ports and rejects mutated port bytes or invalid/throwing results", async () => {
    const document = core(),
      input = Buffer.from(encode(document)),
      ports = fixturePorts();
    let reached!: () => void, finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const release = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const held: EmbeddedRoundTripPorts = {
      sha256: hash,
      verifyPng: async (bytes, width, height) => {
        reached();
        await release;
        return ports.verifyPng(bytes, width, height);
      },
    };
    const pending = validateEmbeddedRoundTripV11(input, held);
    await entered;
    input.fill(0);
    finish();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(new TextDecoder().decode(result.canonicalUtf8)).toBe(
        manifest.documents[0].canonicalUtf8,
      );
    for (const verifyPng of [
      async (bytes: Uint8Array) => {
        bytes[0] = 0;
        return "ok" as const;
      },
      async () => {
        throw new Error("DO_NOT_REPORT_RAW_PORT_ERROR");
      },
      async () => "not-a-result" as "ok",
    ])
      expect(
        await validateEmbeddedRoundTripV11(encode(document), { sha256: hash, verifyPng }),
      ).toEqual({ ok: false, code: "PROJECT_INTERNAL", path: "/atlases/0/image" });
  });
});
