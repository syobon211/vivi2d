import { describe, expect, it } from "vitest";
import {
  createAnimationClip,
  createViviMesh,
  createBoneNode,
  createEmptyProject,
} from "@/test/fixtures";
import {
  listMotionPresetTargetOptions,
  type MotionPresetInput,
  planMotionPreset,
} from "../timeline-motion-presets";

function createProjectForMotionPresets() {
  const mesh = createViviMesh({ id: "mesh-eye", name: "Eye Mesh" });
  const bone = createBoneNode({ id: "bone-arm", name: "Arm" });
  return {
    ...createEmptyProject(),
    layers: [mesh, bone],
    parameters: [
      {
        id: "param-blink",
        name: "Blink",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
      },
      {
        id: "param-breath",
        name: "Breath",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
      },
      {
        id: "param-eye-left",
        name: "Eye Blink Left",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        managedTag: "seeThroughEyeRig:left:parameter",
      },
      {
        id: "param-eye-right",
        name: "Eye Blink Right",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        managedTag: "seeThroughEyeRig:right:parameter",
      },
    ],
  };
}

describe("timeline-motion-presets", () => {
  it("lists managed blink pair targets for blink presets", () => {
    const project = createProjectForMotionPresets();
    const options = listMotionPresetTargetOptions(project, "blinkCycle");
    expect(options[0]?.label).toBe("Managed Blink Pair (Parameters)");
    expect(options).toHaveLength(5);
  });

  it("plans a blink cycle for the managed blink parameter pair", () => {
    const project = createProjectForMotionPresets();
    const clip = createAnimationClip({ duration: 90, fps: 30 });
    const target = listMotionPresetTargetOptions(project, "blinkCycle")[0]!.target;

    const plan = planMotionPreset(project, clip, {
      kind: "blinkCycle",
      target,
      startFrame: 10,
      durationFrames: 30,
      openValue: 0,
      closedValue: 1,
      blinkIntervalFrames: 12,
      closeDurationFrames: 2,
      holdDurationFrames: 1,
      openDurationFrames: 2,
    });

    expect(plan.writes).toHaveLength(2);
    expect(plan.startFrame).toBe(10);
    expect(plan.endFrame).toBe(40);
    expect(plan.writes[0]?.keyframes[0]?.frame).toBe(10);
    expect(plan.writes[0]?.keyframes.at(-1)?.frame).toBe(40);
  });

  it("reports overlap warnings when existing keys are present in the target range", () => {
    const project = createProjectForMotionPresets();
    const clip = createAnimationClip({
      duration: 90,
      fps: 30,
      tracks: [
        {
          parameterId: "param-breath",
          keyframes: [{ frame: 12, value: 0.5, interpolation: "linear" }],
        },
      ],
    });

    const plan = planMotionPreset(project, clip, {
      kind: "breathing",
      target: { kind: "parameter", parameterId: "param-breath" },
      startFrame: 0,
      durationFrames: 24,
      centerValue: 0,
      amplitude: 0.5,
      cycleLengthFrames: 12,
    });

    expect(plan.warnings).toContain(
      "Breath has existing keyframes in frames 0-24 and will be overwritten.",
    );
    expect(plan.writes[0]?.hadOverlap).toBe(true);
  });

  it("creates bone idle sway plans", () => {
    const project = createProjectForMotionPresets();
    const clip = createAnimationClip({ duration: 120, fps: 30 });

    const plan = planMotionPreset(project, clip, {
      kind: "idleSway",
      target: { kind: "bone", boneId: "bone-arm", property: "angle" },
      startFrame: 0,
      durationFrames: 60,
      centerValue: 0,
      amplitude: 15,
      cycleLengthFrames: 30,
    });

    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]?.track.type).toBe("bone");
    expect(plan.writes[0]?.keyframes.some((keyframe) => keyframe.value === 15)).toBe(
      true,
    );
    expect(plan.writes[0]?.keyframes.some((keyframe) => keyframe.value === -15)).toBe(
      true,
    );
  });

  it("clamps parameter targets to their allowed range", () => {
    const project = createProjectForMotionPresets();
    const clip = createAnimationClip({ duration: 60, fps: 30 });
    const input: MotionPresetInput = {
      kind: "breathing",
      target: { kind: "parameter", parameterId: "param-breath" },
      startFrame: 0,
      durationFrames: 30,
      centerValue: 0.8,
      amplitude: 0.6,
      cycleLengthFrames: 15,
    };

    const plan = planMotionPreset(project, clip, input);
    expect(plan.writes[0]?.keyframes.every((keyframe) => keyframe.value <= 1)).toBe(true);
    expect(plan.writes[0]?.keyframes.every((keyframe) => keyframe.value >= -1)).toBe(
      true,
    );
  });

  it("returns an empty plan when the selected range collapses at the clip end", () => {
    const project = createProjectForMotionPresets();
    const clip = createAnimationClip({ duration: 10, fps: 30 });

    const plan = planMotionPreset(project, clip, {
      kind: "blinkCycle",
      target: { kind: "parameter", parameterId: "param-blink" },
      startFrame: 9,
      durationFrames: 10,
      openValue: 0,
      closedValue: 1,
      blinkIntervalFrames: 8,
      closeDurationFrames: 2,
      holdDurationFrames: 1,
      openDurationFrames: 2,
    });

    expect(plan.writes).toHaveLength(0);
    expect(plan.warnings).toContain("Preset range is too short for this motion preset.");
  });
});
