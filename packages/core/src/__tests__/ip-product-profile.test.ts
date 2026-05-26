import { describe, expect, it } from "vitest";
import { parseViviFile } from "../project-parser";
import {
  assertPublicViviFileProfile,
  PUBLIC_PROJECT_PROFILE,
  validatePublicViviFileProfile,
} from "../public-profile";
import type { ProjectData, ViviFileData } from "../types";

function marker(...parts: string[]): string {
  return parts.join("");
}

function baseProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    name: "public-safe",
    width: 128,
    height: 128,
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
    ...overrides,
  };
}

function baseFile(project: ProjectData = baseProject()): ViviFileData {
  return {
    version: 10,
    profile: PUBLIC_PROJECT_PROFILE,
    project,
    atlases: [],
  };
}

describe("public product profile", () => {
  it("accepts the layer/bone/skin public-safe baseline", () => {
    const fileData = baseFile();

    expect(validatePublicViviFileProfile(fileData)).toEqual([]);
    expect(() => assertPublicViviFileProfile(fileData)).not.toThrow();
  });

  it("rejects blocked project fields before unknown keys can be stripped", () => {
    const shapeKey = marker("blend", "Shapes");
    const ruleKey = marker("correct", "ive", "Deformations");
    const linkKey = marker("mesh", "Links");
    const lipTargetKey = marker("target", "Blend", "Shape", "Id");
    const blockedKind = marker("lattice", "Deformer");
    const project = {
      ...baseProject(),
      layers: [
        {
          id: "private-node",
          name: "private node",
          kind: blockedKind,
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "normal",
          expanded: true,
          children: [],
        },
      ],
      lipsyncConfig: {
        ...baseProject().lipsyncConfig,
        [lipTargetKey]: "private-target",
      },
      [shapeKey]: [],
      [ruleKey]: [],
      [linkKey]: [],
    } as unknown as ProjectData;

    const paths = validatePublicViviFileProfile(baseFile(project)).map(
      (issue) => issue.path,
    );

    expect(paths).toEqual(
      expect.arrayContaining([
        `project.${shapeKey}`,
        `project.${ruleKey}`,
        `project.${linkKey}`,
        "project.layers[0]",
        `project.lipsyncConfig.${lipTargetKey}`,
      ]),
    );
  });

  it("rejects parameter bindings to blocked target types", () => {
    const targetTypeA = marker("blend", "Shape");
    const targetTypeB = marker("lattice", "Deformer");
    const project = {
      ...baseProject(),
      parameterBindings: [
        {
          id: "bind-a",
          parameterId: "p",
          target: { type: targetTypeA, targetId: "private-target" },
          bindingPoints: [],
        },
        {
          id: "bind-b",
          parameterId: "p",
          target: { type: targetTypeB, targetId: "private-target" },
          bindingPoints: [],
        },
      ],
    } as unknown as ProjectData;

    const paths = validatePublicViviFileProfile(baseFile(project)).map(
      (issue) => issue.path,
    );

    expect(paths).toEqual([
      "project.parameterBindings[0].target",
      "project.parameterBindings[1].target",
    ]);
  });

  it("rejects blocked animation and preset fields", () => {
    const presetWeightKey = marker("blend", "Shape", "Weights");
    const trackKey = marker("blend", "Shape", "Tracks");
    const poseTrackKey = marker("mesh", "Pose", "Tracks");
    const lipTargetKey = marker("target", "Blend", "Shape", "Id");
    const project = {
      ...baseProject(),
      expressionPresets: [
        {
          id: "preset",
          name: "private",
          values: {},
          [presetWeightKey]: { privateTarget: 1 },
        },
      ],
      clips: [
        {
          id: "clip",
          name: "private",
          duration: 30,
          fps: 30,
          tracks: [],
          [trackKey]: [],
          [poseTrackKey]: [],
          lipSyncTracks: [
            {
              id: "lip",
              name: "private",
              sourceAudioTrackId: "audio",
              analysisType: "rms",
              analysisFps: 30,
              samples: [],
              targetParameterId: null,
              [lipTargetKey]: "private-target",
              sourcePathAtBake: "audio.wav",
              sourceDurationSecondsAtBake: null,
              gain: 1,
              muted: false,
            },
          ],
        },
      ],
    } as unknown as ProjectData;

    const paths = validatePublicViviFileProfile(baseFile(project)).map(
      (issue) => issue.path,
    );

    expect(paths).toEqual(
      expect.arrayContaining([
        `project.expressionPresets[0].${presetWeightKey}`,
        `project.clips[0].${trackKey}`,
        `project.clips[0].${poseTrackKey}`,
        `project.clips[0].lipSyncTracks[0].${lipTargetKey}`,
      ]),
    );
  });

  it("makes public parsing fail closed while internal parsing remains available", () => {
    const presetWeightKey = marker("blend", "Shape", "Weights");
    const json = JSON.stringify({
      version: 10,
      project: {
        ...baseProject(),
        expressionPresets: [
          {
            id: "preset",
            name: "private",
            values: {},
            [presetWeightKey]: { privateTarget: 1 },
          },
        ],
      } as unknown as ProjectData,
      atlases: [],
    });

    expect(() => parseViviFile(json, { profile: PUBLIC_PROJECT_PROFILE })).toThrow(
      /public profile validation failed/,
    );
    expect(() => parseViviFile(json)).not.toThrow();
  });
});
