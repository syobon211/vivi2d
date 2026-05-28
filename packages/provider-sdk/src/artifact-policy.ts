import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeProviderArtifactPath,
  type ViviProviderArtifact,
  ViviProviderError,
} from "./index.js";

export interface ProviderArtifactRootPolicy {
  artifactRoot: string;
}

export interface ValidatedProviderPathArtifact {
  artifact: ViviProviderArtifact;
  absolutePath: string;
  realPath: string;
  sha256: string;
}

export function validateProviderPathArtifact(
  artifact: ViviProviderArtifact,
  policy: ProviderArtifactRootPolicy,
): ValidatedProviderPathArtifact {
  if (!artifact.path) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Artifact ${artifact.id} must provide a relative path.`,
    );
  }
  if (!artifact.sha256) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Path artifact ${artifact.id} must provide sha256.`,
    );
  }
  const relativePath = normalizeProviderArtifactPath(artifact.path);
  const rootRealPath = fs.realpathSync(policy.artifactRoot);
  const absolutePath = path.resolve(rootRealPath, relativePath);
  const openFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(absolutePath, openFlags);

  try {
    const realPath = fs.realpathSync(absolutePath);
    const linkStat = fs.lstatSync(absolutePath);
    const stat = fs.fstatSync(fd);

    if (!isPathInside(rootRealPath, realPath)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} escapes artifactRoot.`,
      );
    }
    if (linkStat.isSymbolicLink()) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} must not be a symlink.`,
      );
    }
    if (linkStat.dev !== stat.dev || linkStat.ino !== stat.ino) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} changed while validating.`,
      );
    }
    if (!stat.isFile()) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} must reference a regular file.`,
      );
    }
    if (stat.nlink > 1) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} must not be hard-linked.`,
      );
    }
    if (stat.size !== artifact.byteLength) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} byteLength does not match the file size.`,
      );
    }

    const sha256 = createHash("sha256").update(fs.readFileSync(fd)).digest("hex");
    if (sha256.toLowerCase() !== artifact.sha256.toLowerCase()) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Path artifact ${artifact.id} sha256 does not match file contents.`,
      );
    }

    return Object.freeze({
      artifact: Object.freeze({ ...artifact, path: relativePath, sha256 }),
      absolutePath,
      realPath,
      sha256,
    });
  } finally {
    fs.closeSync(fd);
  }
}

function isPathInside(rootRealPath: string, candidateRealPath: string): boolean {
  const relative = path.relative(rootRealPath, candidateRealPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
