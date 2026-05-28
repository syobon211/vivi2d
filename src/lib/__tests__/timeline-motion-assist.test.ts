import { describe, expect, it } from "vitest";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import {
  createMotionAssistAutoMappings,
  parseMotionAssistBundle,
  planMotionAssistImport,
} from "../timeline-motion-assist";

function createProject() {
  return {
    ...createEmptyProject(),
    parameters: [
      {
        id: "param-jaw",
        name: "Jaw Open",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
      {
        id: "param-brow",
        name: "Brow Down",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
      },
      {
        id: "param-duplicate",
        name: "Shared",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
      {
        id: "param-duplicate-2",
        name: "Shared",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
    ],
  };
}

describe("timeline-motion-assist", () => {
  it("parses a valid bundle and keeps the later duplicate source sample", () => {
    const bundle = parseMotionAssistBundle(
      JSON.stringify({
        schemaVersion: "1.0.0",
        fps: 24,
        durationFrames: 20,
        channels: [
          {
            id: "jawOpen",
            name: "Jaw Open",
            samples: [
              { frame: 2, value: 0.1 },
              { frame: 2, value: 0.4 },
              { frame: 8, value: 0.7 },
            ],
          },
        ],
      }),
    );

    expect(bundle.channels[0]?.samples).toEqual([
      { frame: 2, value: 0.4 },
      { frame: 8, value: 0.7 },
    ]);
  });

  it("rejects invalid schema versions", () => {
    expect(() =>
      parseMotionAssistBundle(
        JSON.stringify({
          schemaVersion: "2.0.0",
          fps: 30,
          durationFrames: 10,
          channels: [],
        }),
      ),
    ).toThrow("schemaVersion must be 1.0.0");
  });

  it("marks colliding auto-matches as ambiguous", () => {
    const project = createProject();
    const bundle = parseMotionAssistBundle(
      JSON.stringify({
        schemaVersion: "1.0.0",
        fps: 30,
        durationFrames: 10,
        channels: [
          { id: "param-jaw", name: "Jaw Open", samples: [{ frame: 0, value: 0 }] },
          { id: "other", name: "Jaw Open", samples: [{ frame: 0, value: 0 }] },
          { id: "shared-a", name: "Shared", samples: [{ frame: 0, value: 0 }] },
        ],
      }),
    );

    const mappings = createMotionAssistAutoMappings(project, bundle);

    expect(mappings[0]).toMatchObject({
      parameterId: null,
      matchSource: "ambiguous",
    });
    expect(mappings[1]).toMatchObject({
      parameterId: null,
      matchSource: "ambiguous",
    });
    expect(mappings[2]).toMatchObject({
      parameterId: null,
      matchSource: "ambiguous",
    });
  });

  it("plans imports by time, clamps values, warns on overlap, and skips empty projections", () => {
    const project = createProject();
    const clip = createAnimationClip({
      id: "clip-1",
      duration: 30,
      fps: 30,
      tracks: [
        {
          parameterId: "param-jaw",
          keyframes: [{ frame: 15, value: 0.5, interpolation: "linear" }],
        },
      ],
    });
    const bundle = parseMotionAssistBundle(
      JSON.stringify({
        schemaVersion: "1.0.0",
        fps: 24,
        durationFrames: 50,
        channels: [
          {
            id: "param-jaw",
            name: "Jaw Open",
            samples: [
              { frame: 0, value: 0.2 },
              { frame: 12, value: 2.5 },
              { frame: 40, value: 0.8 },
            ],
          },
          {
            id: "param-brow",
            name: "Brow Down",
            samples: [{ frame: 29, value: -2 }],
          },
        ],
      }),
    );

    const plan = planMotionAssistImport(project, clip, bundle, {
      targetStartFrame: 10,
      mappings: [
        {
          channelId: "param-jaw",
          channelLabel: "Jaw Open",
          enabled: true,
          parameterId: "param-jaw",
          scale: 1,
          offset: 0,
          matchSource: "manual",
        },
        {
          channelId: "param-brow",
          channelLabel: "Brow Down",
          enabled: true,
          parameterId: "param-brow",
          scale: 1,
          offset: 0,
          matchSource: "manual",
        },
      ],
    });

    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({
      parameterId: "param-jaw",
      rangeStart: 10,
      rangeEnd: 25,
      hadOverlap: true,
    });
    expect(plan.writes[0]?.keyframes).toEqual([
      { frame: 10, value: 0.2, interpolation: "linear" },
      { frame: 25, value: 1, interpolation: "linear" },
    ]);
    expect(
      plan.warnings.some((warning) => warning.includes("will be overwritten.")),
    ).toBe(true);
    expect(plan.emptyChannelLabels).toEqual(["Brow Down"]);
  });
});
