import { PHYSICS_DEFAULTS } from "@vivi2d/core/constants";
import { describe, expect, it } from "vitest";
import {
  addPendulum,
  addPhysicsGroup,
  addPhysicsInput,
  addPhysicsOutput,
  removePendulum,
  removePhysicsGroup,
  removePhysicsInput,
  removePhysicsOutput,
  setLipSyncConfig,
  updatePendulum,
  updatePhysicsGroup,
} from "../physics-command";
import { createProject } from "./fixtures";

describe("physics commands", () => {
  it("adds, updates, and removes physics groups", () => {
    const project = createProject();

    const id = addPhysicsGroup(
      project,
      "Hair",
      {
        managedTag: "tag",
        managedSignature: "signature",
        managedSourceFingerprint: "fingerprint",
      },
      () => "group-1",
    );

    expect(id).toBe("group-1");
    expect(project.physicsGroups[0]).toMatchObject({
      id,
      name: "Hair",
      enabled: true,
      gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
      gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH,
      wind: PHYSICS_DEFAULTS.WIND,
      managedTag: "tag",
      managedSignature: "signature",
      managedSourceFingerprint: "fingerprint",
    });
    expect(project.physicsGroups[0]?.pendulums).toHaveLength(1);
    expect(
      updatePhysicsGroup(project, id, {
        name: "Tail",
        enabled: false,
        gravityDirection: Number.NaN,
        gravityStrength: 20,
        wind: 3,
      }),
    ).toBe(true);
    expect(project.physicsGroups[0]).toMatchObject({
      name: "Tail",
      enabled: false,
      gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
      gravityStrength: 20,
      wind: 3,
    });
    expect(removePhysicsGroup(project, "missing")).toBe(false);
    expect(removePhysicsGroup(project, id)).toBe(true);
    expect(project.physicsGroups).toEqual([]);
  });

  it("manages pendulums with bounds checks", () => {
    const project = createProject();
    addPhysicsGroup(project, "Hair", undefined, () => "group");

    expect(addPendulum(project, "group")).toBe(true);
    expect(project.physicsGroups[0]?.pendulums).toHaveLength(2);
    expect(
      updatePendulum(project, "group", 1, {
        length: 2,
        mass: Number.POSITIVE_INFINITY,
        damping: 0.2,
      }),
    ).toBe(true);
    expect(project.physicsGroups[0]?.pendulums[1]).toMatchObject({
      length: 2,
      mass: 1,
      damping: 0.2,
    });
    expect(removePendulum(project, "group", -1)).toBe(false);
    expect(removePendulum(project, "group", 0)).toBe(true);
    expect(project.physicsGroups[0]?.pendulums).toHaveLength(1);
  });

  it("clones and sanitizes inputs and outputs", () => {
    const project = createProject();
    addPhysicsGroup(project, "Hair", undefined, () => "group");
    const input = { type: "x" as const, parameterId: "ParamX", weight: Number.NaN };
    const output = {
      type: "boneAngle" as const,
      boneId: "bone",
      pendulumIndex: Number.NaN,
      weight: Number.POSITIVE_INFINITY,
    };

    expect(addPhysicsInput(project, "group", input)).toBe(true);
    expect(addPhysicsOutput(project, "group", output)).toBe(true);
    input.parameterId = "mutated";
    output.boneId = "mutated";

    expect(project.physicsGroups[0]?.inputs[0]).toEqual({
      type: "x",
      parameterId: "ParamX",
      weight: 1,
    });
    expect(project.physicsGroups[0]?.outputs[0]).toEqual({
      type: "boneAngle",
      boneId: "bone",
      pendulumIndex: 0,
      weight: 1,
    });
    expect(removePhysicsInput(project, "group", 99)).toBe(false);
    expect(removePhysicsOutput(project, "group", 99)).toBe(false);
    expect(removePhysicsInput(project, "group", 0)).toBe(true);
    expect(removePhysicsOutput(project, "group", 0)).toBe(true);
  });

  it("updates lip sync config and clones viseme mappings", () => {
    const project = createProject();
    const visemeMappings = [
      {
        viseme: "aa" as const,
        target: {
          type: "parameter" as const,
          parameterId: "ParamMouth",
          value: Number.NaN,
        },
      },
    ];

    expect(
      setLipSyncConfig(project, {
        enabled: true,
        mode: "viseme",
        targetParameterId: "ParamMouth",
        source: "file",
        threshold: Number.NaN,
        smoothing: 0.4,
        gain: 2,
        visemeMappings,
        visemeSmoothing: Number.POSITIVE_INFINITY,
      }),
    ).toBe(true);
    visemeMappings[0]!.target.parameterId = "mutated";

    expect(project.lipsyncConfig).toMatchObject({
      enabled: true,
      mode: "viseme",
      targetParameterId: "ParamMouth",
      source: "file",
      threshold: 0.02,
      smoothing: 0.4,
      gain: 2,
      visemeSmoothing: 0.4,
    });
    expect(project.lipsyncConfig.visemeMappings).toEqual([
      {
        viseme: "aa",
        target: { type: "parameter", parameterId: "ParamMouth", value: 0 },
      },
    ]);
  });

  it("returns false for missing targets", () => {
    const project = createProject();

    expect(updatePhysicsGroup(project, "missing", { name: "X" })).toBe(false);
    expect(addPendulum(project, "missing")).toBe(false);
    expect(removePendulum(project, "missing", 0)).toBe(false);
    expect(updatePendulum(project, "missing", 0, { mass: 2 })).toBe(false);
    expect(
      addPhysicsInput(project, "missing", { type: "x", parameterId: "p", weight: 1 }),
    ).toBe(false);
    expect(removePhysicsInput(project, "missing", 0)).toBe(false);
    expect(
      addPhysicsOutput(project, "missing", {
        type: "angle",
        parameterId: "p",
        pendulumIndex: 0,
        weight: 1,
      }),
    ).toBe(false);
    expect(removePhysicsOutput(project, "missing", 0)).toBe(false);
  });
});
