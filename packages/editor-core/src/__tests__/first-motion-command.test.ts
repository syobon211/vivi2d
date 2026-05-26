import type { ProjectData } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  applyFirstMotionPlan,
  createFirstMotionDefaults,
  createFirstMotionPlan,
} from "../first-motion-command";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";

function createProject(): {
  project: ProjectData;
  clip: ReturnType<typeof createAnimationClip>;
} {
  const clip = createAnimationClip({ id: "clip-1", name: "Idle", duration: 90, fps: 30 });
  return {
    clip,
    project: {
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
        {
          id: "param-sway",
          name: "Idle Sway",
          minValue: -30,
          maxValue: 30,
          defaultValue: 0,
        },
      ],
      clips: [clip],
    },
  };
}

describe("timeline-first-motion", () => {
  it("uses the active clip as the default destination when one exists", () => {
    const { project, clip } = createProject();
    const defaults = createFirstMotionDefaults(project, clip);
    expect(defaults.state.clipMode).toBe("active");
    expect(defaults.state.durationFrames).toBe(clip.duration);
    expect(defaults.state.fps).toBe(clip.fps);
    expect(defaults.state.blinkEnabled).toBe(true);
    expect(defaults.state.breathingEnabled).toBe(true);
  });

  it("defaults to creating a new clip when there is no active clip", () => {
    const { project } = createProject();
    const defaults = createFirstMotionDefaults(project, null);
    expect(defaults.state.clipMode).toBe("new");
    expect(defaults.state.durationFrames).toBe(120);
    expect(defaults.state.fps).toBe(30);
  });

  it("creates an idle-only plan with generated blink and breathing writes", () => {
    const { project, clip } = createProject();
    const { state } = createFirstMotionDefaults(project, clip);
    const plan = createFirstMotionPlan(project, clip, state);
    expect(plan.destinationClip.id).toBe(clip.id);
    expect(plan.idlePlan?.writes.length).toBeGreaterThan(0);
    expect(plan.swayPlan).toBeNull();
    expect(plan.hasApplicableWrites).toBe(true);
  });

  it("adds a sway plan when a sway target is explicitly enabled", () => {
    const { project, clip } = createProject();
    const defaults = createFirstMotionDefaults(project, clip);
    const plan = createFirstMotionPlan(project, clip, {
      ...defaults.state,
      swayEnabled: true,
      swayTargetId: "parameter:param-sway",
    });
    expect(plan.swayPlan).not.toBeNull();
    expect(plan.affectedTrackLabels).toContain("Idle Sway");
  });

  it("disables apply when no enabled section has valid writes", () => {
    const { project, clip } = createProject();
    const defaults = createFirstMotionDefaults(project, clip);
    const plan = createFirstMotionPlan(project, clip, {
      ...defaults.state,
      blinkEnabled: false,
      breathingEnabled: false,
      swayEnabled: false,
    });
    expect(plan.hasApplicableWrites).toBe(false);
  });

  it("applies generated first motion writes to an active clip", () => {
    const { project, clip } = createProject();
    const { state } = createFirstMotionDefaults(project, clip);

    const result = applyFirstMotionPlan(project, {
      activeClipId: clip.id,
      state,
    });

    expect(result).toMatchObject({ clipId: clip.id, applied: true });
    expect(project.clips[0]?.tracks.length).toBeGreaterThan(0);
  });

  it("creates and configures a new clip before applying generated writes", () => {
    const { project } = createProject();
    const { state } = createFirstMotionDefaults(project, null);

    const result = applyFirstMotionPlan(project, {
      activeClipId: null,
      state: {
        ...state,
        clipName: "Generated intro",
        durationFrames: 72,
        fps: 24,
      },
      createId: () => "generated-clip",
    });

    expect(result).toMatchObject({ clipId: "generated-clip", applied: true });
    expect(project.clips.at(-1)).toMatchObject({
      id: "generated-clip",
      name: "Generated intro",
      duration: 72,
      fps: 24,
    });
    expect(project.clips.at(-1)?.tracks.length).toBeGreaterThan(0);
  });

  it("does not mutate the project when active mode has no active clip", () => {
    const { project, clip } = createProject();
    const { state } = createFirstMotionDefaults(project, clip);

    const result = applyFirstMotionPlan(project, {
      activeClipId: "missing",
      state,
    });

    expect(result).toEqual({ clipId: null, plan: null, applied: false });
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0]?.tracks).toEqual([]);
  });
});
