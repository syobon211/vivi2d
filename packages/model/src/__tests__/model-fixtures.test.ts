import { encode as encodeMessagePack } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import { mergeParameterDefaults } from "../parameter-utils";
import { assertNoLocalMotionPreviewFields } from "../private-profile-guards";
import { parseViviFile } from "../project-parser";
import {
  PUBLIC_PROJECT_PROFILE,
  validatePublicRawViviFileProfile,
} from "../public-profile";
import { VIVI_RUNTIME_PROJECT_FILE_VERSION } from "../runtime-spec";
import type { ViviFileData } from "../types";
import { decodeViviBinary } from "../vivib-format";

const VIVB_MAGIC = new Uint8Array([0x56, 0x49, 0x56, 0x42]);
const VIVB_FORMAT_VERSION = 1;
const VIVB_HEADER_LENGTH = 9;

function createPublicFileData(): ViviFileData {
  return {
    version: VIVI_RUNTIME_PROJECT_FILE_VERSION,
    profile: PUBLIC_PROJECT_PROFILE,
    project: {
      name: "public-fixture",
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

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function makeVivb(meta: unknown): ArrayBuffer {
  const metaBytes = encodeMessagePack(meta);
  const bytes = new Uint8Array(VIVB_HEADER_LENGTH + metaBytes.length);
  bytes.set(VIVB_MAGIC, 0);
  bytes[4] = VIVB_FORMAT_VERSION;
  writeUint32LE(bytes, 5, metaBytes.length);
  bytes.set(metaBytes, VIVB_HEADER_LENGTH);
  return bytes.buffer;
}

describe("model public-profile fixtures", () => {
  it("rejects unknown root fields for public profile loads before schema stripping", () => {
    const fileData = {
      ...createPublicFileData(),
      authoringOnly: true,
    };

    expect(() =>
      parseViviFile(JSON.stringify(fileData), { profile: PUBLIC_PROJECT_PROFILE }),
    ).toThrow(/unknown fields/);
  });

  it("rejects unknown project fields for public profile loads before schema stripping", () => {
    const fileData = createPublicFileData();
    (fileData.project as Record<string, unknown>).authoringOnly = true;

    expect(() =>
      parseViviFile(JSON.stringify(fileData), { profile: PUBLIC_PROJECT_PROFILE }),
    ).toThrow(/unknown fields/);
  });

  it("does not invoke hostile getters while scanning raw public profile objects", () => {
    const fileData = createPublicFileData() as unknown as Record<string, unknown>;
    Object.defineProperty(fileData.project, "authoringOnly", {
      enumerable: true,
      get() {
        throw new Error("getter should not run");
      },
    });

    const issues = validatePublicRawViviFileProfile(fileData);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "unknownPublicField",
        path: "project.authoringOnly",
      }),
    );
  });

  it("rejects local-motion preview markers in public profile payloads", () => {
    const fileData = createPublicFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    project.layers = [
      {
        id: "layer-local-motion",
        name: "local motion leak",
        kind: "viviMesh",
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        blendMode: "normal",
        expanded: true,
        children: [],
        LocalMotionDraft: { previewOnly: true },
      },
    ];

    const issues = validatePublicRawViviFileProfile(fileData);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbiddenPublicFeature",
          path: "project.layers[0].LocalMotionDraft",
        }),
      ]),
    );
  });

  it("rejects motion handle drafts at persistent boundary guard entrypoints", () => {
    expect(() =>
      assertNoLocalMotionPreviewFields(
        {
          undo: {
            motionHandleDraft: {
              generation: 1,
            },
          },
        },
        "undoSnapshot",
      ),
    ).toThrow(/motionHandleDraft/);
  });

  it("rejects preview vertex buffers at runtime payload guard entrypoints", () => {
    expect(() =>
      assertNoLocalMotionPreviewFields(
        {
          layers: [
            {
              id: "layer-a",
              previewDeformedVertices: [0, 1, 2],
            },
          ],
        },
        "runtimePayload",
      ),
    ).toThrow(/previewDeformedVertices/);
  });

  it("rejects high-signal local-motion string markers without invoking getters", () => {
    const payload = {
      project: {
        layers: [
          {
            id: "layer-a",
            kind: "viviMesh",
            metadata: "Local Preview Solver should not persist",
          },
        ],
      },
    } as unknown as Record<string, unknown>;
    Object.defineProperty(payload.project, "motionHandleDraft", {
      enumerable: true,
      get() {
        throw new Error("getter should not run");
      },
    });

    const issues = validatePublicRawViviFileProfile(payload);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbiddenPublicFeature",
          path: "project.motionHandleDraft",
        }),
        expect.objectContaining({
          code: "forbiddenPublicFeature",
          path: "project.layers[0].metadata",
        }),
      ]),
    );
  });

  it("rejects editor preview symbol keys at persistent boundary guard entrypoints", () => {
    const editorPreviewSymbol = Symbol("vivi2d.editorPreview");

    expect(() =>
      assertNoLocalMotionPreviewFields(
        {
          [editorPreviewSymbol]: true,
          value: { id: "preview" },
        },
        "projectSave",
      ),
    ).toThrow(/editorPreview/);
  });

  it("rejects local-motion preview markers inside Map and Set containers", () => {
    expect(() =>
      assertNoLocalMotionPreviewFields(
        new Map<unknown, unknown>([["safe", new Set([{ previewOnly: true }])]]),
        "workflowArtifact",
      ),
    ).toThrow(/previewOnly/);
  });

  it("rejects solver and bbw markers in public profile raw data", () => {
    const fileData = createPublicFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    project.skins = {
      skinA: {
        layerId: "layer-a",
        solver: "bbw",
      },
    };

    const issues = validatePublicRawViviFileProfile(fileData);

    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["project.skins.skinA.solver"]),
    );
  });

  it("handles cyclic hostile raw objects without overflowing", () => {
    const fileData = createPublicFileData() as unknown as Record<string, unknown>;
    const project = fileData.project as Record<string, unknown>;
    project.self = project;
    project.layers = [project.layers, project];

    const issues = validatePublicRawViviFileProfile(fileData);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknownPublicField",
          path: "project.self",
        }),
      ]),
    );
  });

  it("rejects fuzzed private marker spellings without raw parser failures", () => {
    const markerPayloads = [
      "Local Preview Solver",
      "local-preview-solver",
      "LOCAL_PREVIEW_SOLVER",
      "moving least squares",
      "preview/deformed/vertices",
    ];

    for (const marker of markerPayloads) {
      const fileData = createPublicFileData() as unknown as Record<string, unknown>;
      const project = fileData.project as Record<string, unknown>;
      project.layers = [
        {
          id: "layer-a",
          kind: "viviMesh",
          metadata: marker,
        },
      ];

      const issues = validatePublicRawViviFileProfile(fileData);

      expect(issues, marker).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "forbiddenPublicFeature",
            path: "project.layers[0].metadata",
          }),
        ]),
      );
    }
  });
});

describe("model parser fuzz fixtures", () => {
  it("keeps malformed public-profile JSON failures bounded", () => {
    const malformedInputs = [
      "",
      "{",
      "null",
      "[]",
      JSON.stringify({ ...createPublicFileData(), project: null }),
      JSON.stringify({ ...createPublicFileData(), atlases: "not-array" }),
    ];

    for (const input of malformedInputs) {
      expect(
        () => parseViviFile(input, { profile: PUBLIC_PROJECT_PROFILE }),
        input,
      ).toThrow(/(\.vivi file|project field|schema validation)/);
    }
  });
});

describe("model numeric fixtures", () => {
  it("clamps known parameter overrides through the model-owned sanitizer", () => {
    const merged = mergeParameterDefaults(
      [{ id: "ParamAngleX", minValue: -30, maxValue: 30, defaultValue: 0 }],
      { ParamAngleX: 90 },
      { clampKnown: true, rejectInvalid: true },
    );

    expect(merged.ParamAngleX).toBe(30);
  });

  it("rejects non-finite known parameter overrides when requested", () => {
    expect(() =>
      mergeParameterDefaults(
        [{ id: "ParamAngleX", minValue: -30, maxValue: 30, defaultValue: 0 }],
        { ParamAngleX: Number.NaN },
        { rejectInvalid: true },
      ),
    ).toThrow(/must be finite/);
  });
});

describe("model binary fixtures", () => {
  it("canonicalizes malformed .vivb metadata instead of leaking raw TypeError", () => {
    expect(() =>
      decodeViviBinary(
        makeVivb({
          version: VIVI_RUNTIME_PROJECT_FILE_VERSION,
          project: createPublicFileData().project,
        }),
      ),
    ).toThrow(".vivb file metadata is invalid: atlases is not an array");
  });

  it("validates public-profile .vivb metadata before schema stripping", () => {
    const fileData = createPublicFileData();
    (fileData.project as Record<string, unknown>).authoringOnly = true;

    expect(() => decodeViviBinary(makeVivb(fileData))).toThrow(/unknown fields/);
  });
});
