import { describe, expect, it } from "vitest";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";
import { detectIdleSynthTargets, planIdleSynth } from "../timeline-idle-synth";

function createProject() {
  return {
    ...createEmptyProject(),
    parameters: [
      {
        id: "blink-left",
        name: "Eye Blink Left",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        managedTag: "seeThroughEyeRig:left:parameter",
      },
      {
        id: "blink-right",
        name: "Eye Blink Right",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        managedTag: "seeThroughEyeRig:right:parameter",
      },
      {
        id: "param-breath",
        name: "Breath",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
      },
    ],
  };
}

describe("timeline-idle-synth", () => {
  it("detects managed blink pairs and breathing parameters conservatively", () => {
    const detection = detectIdleSynthTargets(createProject());

    expect(detection.defaultBlinkTargetId).toContain("managedBlinkPairParameter");
    expect(detection.defaultBreathingTargetId).toBe("parameter:param-breath");
    expect(detection.warnings).toEqual([]);
  });

  it("produces deterministic plans for a fixed seed", () => {
    const project = createProject();
    const clip = createAnimationClip({ id: "clip-1", duration: 120, fps: 30 });
    const detection = detectIdleSynthTargets(project);
    const blinkTarget = detection.blinkOptions.find(
      (option) => option.id === detection.defaultBlinkTargetId,
    )!.target;
    const breathingTarget = detection.breathingOptions.find(
      (option) => option.id === detection.defaultBreathingTargetId,
    )!.target;

    const input = {
      startFrame: 10,
      durationFrames: 60,
      seed: 42,
      blink: {
        enabled: true,
        target: blinkTarget,
        openValue: 0,
        closedValue: 1,
        minIntervalFrames: 18,
        maxIntervalFrames: 24,
        closeDurationFrames: 2,
        holdDurationFrames: 1,
        openDurationFrames: 2,
      },
      breathing: {
        enabled: true,
        target: breathingTarget,
        centerValue: 0,
        minAmplitude: 0.1,
        maxAmplitude: 0.2,
        minCycleLengthFrames: 24,
        maxCycleLengthFrames: 36,
      },
    } as const;

    const planA = planIdleSynth(project, clip, input);
    const planB = planIdleSynth(project, clip, input);

    expect(planA).toEqual(planB);
  });

  it("rejects same-target conflicts and keeps the range closed", () => {
    const project = createProject();
    const clip = createAnimationClip({
      id: "clip-1",
      duration: 60,
      fps: 30,
      tracks: [
        {
          parameterId: "param-breath",
          keyframes: [{ frame: 15, value: 0.2, interpolation: "linear" }],
        },
      ],
    });

    const plan = planIdleSynth(project, clip, {
      startFrame: 10,
      durationFrames: 20,
      seed: 1,
      blink: {
        enabled: false,
        target: null,
        openValue: 0,
        closedValue: 1,
        minIntervalFrames: 18,
        maxIntervalFrames: 24,
        closeDurationFrames: 2,
        holdDurationFrames: 1,
        openDurationFrames: 2,
      },
      breathing: {
        enabled: true,
        target: { kind: "parameter", parameterId: "param-breath" },
        centerValue: 0,
        minAmplitude: 0.1,
        maxAmplitude: 0.1,
        minCycleLengthFrames: 10,
        maxCycleLengthFrames: 10,
      },
    });

    expect(plan.startFrame).toBe(10);
    expect(plan.endFrame).toBe(29);
    expect(plan.writes[0]?.rangeStart).toBe(10);
    expect(plan.writes[0]?.rangeEnd).toBe(29);
    expect(plan.writes[0]?.hadOverlap).toBe(true);

    const conflictPlan = planIdleSynth(project, clip, {
      startFrame: 0,
      durationFrames: 30,
      seed: 2,
      blink: {
        enabled: true,
        target: { kind: "parameter", parameterId: "param-breath" },
        openValue: 0,
        closedValue: 1,
        minIntervalFrames: 10,
        maxIntervalFrames: 10,
        closeDurationFrames: 2,
        holdDurationFrames: 1,
        openDurationFrames: 2,
      },
      breathing: {
        enabled: true,
        target: { kind: "parameter", parameterId: "param-breath" },
        centerValue: 0,
        minAmplitude: 0.1,
        maxAmplitude: 0.1,
        minCycleLengthFrames: 10,
        maxCycleLengthFrames: 10,
      },
    });

    expect(conflictPlan.writes).toHaveLength(1);
    expect(conflictPlan.conflictingSections).toContain("breathing");
    expect(
      conflictPlan.warnings.some((warning) =>
        warning.includes("targeted more than once"),
      ),
    ).toBe(true);
  });
});
