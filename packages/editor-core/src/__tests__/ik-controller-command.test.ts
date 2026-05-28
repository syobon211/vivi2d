import type { IKBoneConstraint, IKParameterMapping } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  addIKController,
  addIKParameterMapping,
  applyIKBendProfile,
  applyLimbBendProfile,
  canApplyLimbBendProfile,
  detectLimbBendProfile,
  removeIKController,
  removeIKParameterMapping,
  setIKInfluence,
  setIKMaxIterations,
  setIKPoleTarget,
  setIKTarget,
} from "../ik-controller-command";
import { createProject } from "./fixtures";

function createChain(): IKBoneConstraint[] {
  return [
    { boneId: "upper", minAngle: -Math.PI, maxAngle: Math.PI },
    { boneId: "lower", minAngle: -Math.PI / 2, maxAngle: Math.PI / 2 },
  ];
}

describe("ik controller commands", () => {
  it("adds a controller with cloned constraints", () => {
    const project = createProject({ ikControllers: undefined });
    const chain = createChain();
    const id = addIKController(
      project,
      { name: "Arm IK", solverType: "twoBone", boneChain: chain },
      () => "ik-1",
    );

    chain[0]!.minAngle = 123;

    expect(id).toBe("ik-1");
    expect(project.ikControllers).toHaveLength(1);
    expect(project.ikControllers?.[0]).toMatchObject({
      id,
      name: "Arm IK",
      solverType: "twoBone",
      targetX: 0,
      targetY: 0,
      influence: 1,
      parameterMappings: [],
    });
    expect(project.ikControllers?.[0]?.boneChain[0]?.minAngle).toBe(-Math.PI);
  });

  it("removes controllers and ignores missing ids", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "Arm IK", solverType: "twoBone", boneChain: [] },
      () => "ik-1",
    );

    expect(removeIKController(project, "missing")).toBe(false);
    expect(removeIKController(project, "ik-1")).toBe(true);
    expect(project.ikControllers).toEqual([]);
  });

  it("updates target values and rejects non-finite coordinates", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "Arm IK", solverType: "twoBone", boneChain: [] },
      () => "ik-1",
    );

    expect(setIKTarget(project, "ik-1", 10, 20)).toBe(true);
    expect(setIKPoleTarget(project, "ik-1", -5, 30)).toBe(true);
    expect(setIKTarget(project, "ik-1", Number.NaN, 0)).toBe(false);
    expect(project.ikControllers?.[0]).toMatchObject({
      targetX: 10,
      targetY: 20,
      poleTargetX: -5,
      poleTargetY: 30,
    });
  });

  it("clamps influence and max iterations", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "Arm IK", solverType: "ccd", boneChain: [] },
      () => "ik-1",
    );

    expect(setIKInfluence(project, "ik-1", -0.5)).toBe(true);
    expect(project.ikControllers?.[0]?.influence).toBe(0);
    expect(setIKInfluence(project, "ik-1", 1.5)).toBe(true);
    expect(project.ikControllers?.[0]?.influence).toBe(1);
    expect(setIKInfluence(project, "ik-1", Number.POSITIVE_INFINITY)).toBe(false);

    expect(setIKMaxIterations(project, "ik-1", 0)).toBe(true);
    expect(project.ikControllers?.[0]?.maxIterations).toBe(1);
    expect(setIKMaxIterations(project, "ik-1", 5.7)).toBe(true);
    expect(project.ikControllers?.[0]?.maxIterations).toBe(6);
  });

  it("adds cloned parameter mappings and removes them by index", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "Arm IK", solverType: "twoBone", boneChain: [] },
      () => "ik-1",
    );
    const mapping: IKParameterMapping = {
      boneId: "upper",
      parameterId: "param-angle",
      angleMin: -1,
      angleMax: 1,
      paramMin: 0,
      paramMax: 1,
    };

    expect(addIKParameterMapping(project, "ik-1", mapping)).toBe(true);
    mapping.angleMax = 2;
    expect(project.ikControllers?.[0]?.parameterMappings[0]?.angleMax).toBe(1);
    expect(removeIKParameterMapping(project, "ik-1", 99)).toBe(false);
    expect(removeIKParameterMapping(project, "ik-1", 0)).toBe(true);
    expect(project.ikControllers?.[0]?.parameterMappings).toEqual([]);
  });

  it("applies and detects limb bend profiles", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "Arm IK", solverType: "twoBone", boneChain: createChain() },
      () => "ik-1",
    );

    expect(applyIKBendProfile(project, "ik-1", "standard")).toBe(true);
    const controller = project.ikControllers![0]!;
    expect(controller.boneChain[0]?.minAngle).toBeCloseTo((-135 * Math.PI) / 180);
    expect(controller.boneChain[1]?.maxAngle).toBeCloseTo((160 * Math.PI) / 180);
    expect(detectLimbBendProfile(controller)).toBe("standard");

    expect(applyIKBendProfile(project, "ik-1", "loose")).toBe(true);
    expect(detectLimbBendProfile(project.ikControllers![0]!)).toBe("loose");
  });

  it("returns null/custom for unsupported or non-matching profiles", () => {
    const project = createProject();
    addIKController(
      project,
      { name: "CCD IK", solverType: "ccd", boneChain: createChain() },
      () => "ik-1",
    );
    const unsupported = project.ikControllers![0]!;

    expect(canApplyLimbBendProfile(unsupported)).toBe(false);
    expect(applyLimbBendProfile(unsupported, "standard")).toBeNull();
    expect(detectLimbBendProfile(unsupported)).toBeNull();

    unsupported.solverType = "twoBone";
    unsupported.boneChain = [
      { boneId: "upper", minAngle: -1.23, maxAngle: 1.23 },
      { boneId: "lower", minAngle: -0.42, maxAngle: 2.1 },
    ];
    expect(detectLimbBendProfile(unsupported)).toBe("custom");
  });
});
