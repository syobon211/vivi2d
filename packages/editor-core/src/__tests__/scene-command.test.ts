import { describe, expect, it } from "vitest";
import {
  createScene,
  deleteScene,
  duplicateScene,
  renameScene,
} from "../scene-command";
import { createProject } from "./fixtures";

describe("scene commands", () => {
  it("creates, renames, and deletes scenes", () => {
    const project = createProject({ scenes: [] });

    const id = createScene(project, "Idle", () => "scene-1");

    expect(id).toBe("scene-1");
    expect(project.scenes).toEqual([{ id, name: "Idle", clips: [] }]);
    expect(renameScene(project, id, "Blink")).toBe(true);
    expect(project.scenes[0]?.name).toBe("Blink");
    expect(deleteScene(project, "missing")).toBe(false);
    expect(deleteScene(project, id)).toBe(true);
    expect(project.scenes).toEqual([]);
  });

  it("duplicates scenes with deeply cloned clip tracks", () => {
    const project = createProject({
      scenes: [
        {
          id: "scene-1",
          name: "Idle",
          clips: [
            {
              id: "clip-1",
              name: "Clip",
              duration: 60,
              fps: 30,
              tracks: [
                {
                  parameterId: "param-x",
                  keyframes: [{ frame: 0, value: 1, interpolation: "linear" }],
                },
              ],
              boneTracks: [
                {
                  boneId: "bone-1",
                  property: "rotation",
                  keyframes: [{ frame: 1, value: 2, interpolation: "step" }],
                },
              ],
              imageSequenceTracks: [
                {
                  targetMeshId: "mesh-1",
                  entries: [{ startFrame: 0, imageId: "image-1" }],
                },
              ],
              audioTracks: [
                {
                  id: "audio-1",
                  name: "Audio",
                  sourcePath: "voice.wav",
                  startFrame: 0,
                  sourceDurationSeconds: 1,
                  gain: 1,
                  muted: false,
                },
              ],
              lipSyncTracks: [
                {
                  id: "lip-1",
                  name: "Lip",
                  sourceAudioTrackId: "audio-1",
                  analysisType: "rms",
                  analysisFps: 30,
                  samples: [0.1, 0.2],
                  targetParameterId: "param-mouth",
                  sourcePathAtBake: "voice.wav",
                  sourceDurationSecondsAtBake: 1,
                  gain: 1,
                  muted: false,
                },
              ],
              ikControllerTracks: [
                {
                  controllerId: "ik-1",
                  targetXKeyframes: [
                    { frame: 0, value: 10, interpolation: "linear" },
                  ],
                  targetYKeyframes: [
                    { frame: 0, value: 20, interpolation: "linear" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    let idCounter = 0;

    const copyId = duplicateScene(project, "scene-1", "copy", () => `id-${++idCounter}`);

    expect(copyId).toBe("id-1");
    const originalClip = project.scenes[0]!.clips[0]!;
    const copiedClip = project.scenes[1]!.clips[0]!;
    expect(project.scenes[1]?.name).toBe("Idle (copy)");
    expect(copiedClip.id).toBe("id-2");
    expect(copiedClip.tracks[0]?.keyframes[0]).toEqual(
      originalClip.tracks[0]?.keyframes[0],
    );
    expect(copiedClip.tracks[0]?.keyframes[0]).not.toBe(
      originalClip.tracks[0]?.keyframes[0],
    );
    expect(copiedClip.boneTracks?.[0]?.keyframes[0]).not.toBe(
      originalClip.boneTracks?.[0]?.keyframes[0],
    );
    expect(copiedClip.imageSequenceTracks?.[0]?.entries[0]).not.toBe(
      originalClip.imageSequenceTracks?.[0]?.entries[0],
    );
    expect(copiedClip.audioTracks?.[0]).not.toBe(originalClip.audioTracks?.[0]);
    expect(copiedClip.lipSyncTracks?.[0]?.samples).not.toBe(
      originalClip.lipSyncTracks?.[0]?.samples,
    );
    expect(copiedClip.ikControllerTracks?.[0]?.targetXKeyframes[0]).not.toBe(
      originalClip.ikControllerTracks?.[0]?.targetXKeyframes[0],
    );
  });

  it("returns an empty id when the source scene is missing", () => {
    const project = createProject({ scenes: [] });

    expect(duplicateScene(project, "missing", "copy", () => "unused")).toBe("");
    expect(project.scenes).toEqual([]);
  });
});
