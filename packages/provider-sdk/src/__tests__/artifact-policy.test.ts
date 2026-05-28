import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateProviderPathArtifact } from "../artifact-policy";
import type { ViviProviderArtifact } from "../index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-provider-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createArtifact(overrides: Partial<ViviProviderArtifact>): ViviProviderArtifact {
  return {
    id: "artifact",
    kind: "metadata",
    mediaType: "application/json",
    byteLength: 2,
    path: "artifact.json",
    sha256: sha256(new Uint8Array([123, 125])),
    ...overrides,
  };
}

describe("provider artifact path policy", () => {
  it("accepts regular files below artifactRoot with matching byteLength and sha256", () => {
    const artifactRoot = makeTempRoot();
    fs.writeFileSync(path.join(artifactRoot, "artifact.json"), "{}");

    const result = validateProviderPathArtifact(createArtifact({}), {
      artifactRoot,
    });

    expect(result.artifact.path).toBe("artifact.json");
    expect(result.sha256).toBe(createArtifact({}).sha256);
    expect(result.realPath.startsWith(fs.realpathSync(artifactRoot))).toBe(true);
  });

  it("rejects hash mismatches for path artifacts", () => {
    const artifactRoot = makeTempRoot();
    fs.writeFileSync(path.join(artifactRoot, "artifact.json"), "{}");

    expect(() =>
      validateProviderPathArtifact(createArtifact({ sha256: "0".repeat(64) }), {
        artifactRoot,
      }),
    ).toThrow(/sha256 does not match/);
  });

  it("rejects missing path hashes before reading host files", () => {
    const artifactRoot = makeTempRoot();
    fs.writeFileSync(path.join(artifactRoot, "artifact.json"), "{}");

    expect(() =>
      validateProviderPathArtifact(createArtifact({ sha256: undefined }), {
        artifactRoot,
      }),
    ).toThrow(/must provide sha256/);
  });

  it("rejects hard-linked path artifacts", () => {
    const artifactRoot = makeTempRoot();
    const sourcePath = path.join(artifactRoot, "artifact.json");
    const linkedPath = path.join(artifactRoot, "linked.json");
    fs.writeFileSync(sourcePath, "{}");
    fs.linkSync(sourcePath, linkedPath);

    expect(() =>
      validateProviderPathArtifact(createArtifact({ path: "linked.json" }), {
        artifactRoot,
      }),
    ).toThrow(/must not be hard-linked/);
  });
});
