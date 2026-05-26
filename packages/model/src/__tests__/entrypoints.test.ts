import { ensureProjectDefaults } from "@vivi2d/model/project-migration";
import { parseViviFile } from "@vivi2d/model/project-parser";
import { ViviFileDataSchema } from "@vivi2d/model/project-schema";
import {
  assertPublicViviFileProfile,
  PUBLIC_PROJECT_PROFILE,
} from "@vivi2d/model/public-profile";
import { VIVI_RUNTIME_PROJECT_FILE_VERSION } from "@vivi2d/model/runtime-spec";
import type { ViviFileData } from "@vivi2d/model/types";
import {
  decodeViviBinary,
  encodeViviBinary,
  isViviBinaryFormat,
} from "@vivi2d/model/vivib-format";
import { describe, expect, it } from "vitest";

function createPublicFileData(): ViviFileData {
  return {
    version: VIVI_RUNTIME_PROJECT_FILE_VERSION,
    profile: PUBLIC_PROJECT_PROFILE,
    project: {
      name: "model-entrypoint-fixture",
      width: 64,
      height: 64,
      layers: [],
      parameters: [],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders: [],
      stateMachines: [],
    },
    atlases: [],
  };
}

describe("@vivi2d/model entrypoints", () => {
  it("loads public project data through direct model subpath exports", () => {
    const fileData = createPublicFileData();

    const parsed = parseViviFile(JSON.stringify(fileData), {
      profile: PUBLIC_PROJECT_PROFILE,
    });
    const projectWithDefaults = ensureProjectDefaults(parsed.project);

    expect(ViviFileDataSchema.safeParse(parsed).success).toBe(true);
    expect(projectWithDefaults.scenes).toEqual([]);
    expect(projectWithDefaults.colliders).toEqual([]);
    expect(() => assertPublicViviFileProfile(parsed)).not.toThrow();
  });

  it("round-trips the direct model binary format export", () => {
    const fileData = createPublicFileData();

    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);

    expect(isViviBinaryFormat(binary.buffer)).toBe(true);
    expect(decoded).toEqual(fileData);
  });

  it("treats undefined metadata fields like JSON serialization", () => {
    const fileData = createPublicFileData();
    (fileData.project as typeof fileData.project & { sourceKind?: undefined }).sourceKind =
      undefined;

    const binary = encodeViviBinary(fileData);
    const decoded = decodeViviBinary(binary.buffer);

    expect(decoded.project).not.toHaveProperty("sourceKind");
    expect(() => assertPublicViviFileProfile(decoded)).not.toThrow();
  });
});
