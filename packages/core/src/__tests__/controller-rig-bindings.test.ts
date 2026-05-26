import { describe, expect, it } from "vitest";
import {
  applyBoneOverridesToLayers,
  evaluateBindings,
  type BindingsPrev,
} from "../model/bindings";
import type { BoneNode, ParameterBinding, ProjectData } from "../types";

function createBone(id: string, x: number, y: number): BoneNode {
  return {
    id,
    name: id,
    visible: true,
    opacity: 1,
    x,
    y,
    width: 0,
    height: 0,
    blendMode: "normal",
    expanded: true,
    kind: "bone",
    children: [],
    bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
  };
}

function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    name: "controller-rig-test",
    width: 256,
    height: 256,
    layers: [],
    parameters: [
      { id: "p", name: "P", minValue: 0, maxValue: 1, defaultValue: 0 },
    ],
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

function createPrev(): BindingsPrev {
  return {
    boneX: {},
    boneY: {},
    boneAngles: {},
    boneScaleX: {},
    boneScaleY: {},
    ikTargetX: {},
    ikTargetY: {},
    ikPoleTargetX: {},
    ikPoleTargetY: {},
    ikInfluence: {},
  };
}

describe("controller rig parameter bindings", () => {
  it("drives bone position as controller state without storing mesh deltas", () => {
    const bone = createBone("bone-1", 10, 20);
    const project = createProject({
      layers: [bone],
      parameterBindings: [
        {
          id: "bind-x",
          parameterId: "p",
          target: { type: "bone", boneId: "bone-1", property: "x" },
          bindingPoints: [
            { paramValue: 0, targetValue: 10 },
            { paramValue: 1, targetValue: 40 },
          ],
        },
        {
          id: "bind-y",
          parameterId: "p",
          target: { type: "bone", boneId: "bone-1", property: "y" },
          bindingPoints: [
            { paramValue: 0, targetValue: 20 },
            { paramValue: 1, targetValue: 50 },
          ],
        },
      ] satisfies ParameterBinding[],
    });

    const result = evaluateBindings(
      project.parameterBindings,
      { p: 0.5 },
      project,
      createPrev(),
      { boneX: { "bone-1": 10 }, boneY: { "bone-1": 20 } },
    );

    applyBoneOverridesToLayers(
      project.layers,
      result.boneX,
      result.boneY,
      result.boneAngles,
      result.boneScaleX,
      result.boneScaleY,
    );

    expect(bone.x).toBe(25);
    expect(bone.y).toBe(35);
  });

  it("drives IK controller targets and influence instead of mesh shapes", () => {
    const project = createProject({
      ikControllers: [
        {
          id: "ik-1",
          name: "IK",
          solverType: "ccd",
          boneChain: [
            { boneId: "bone-1", minAngle: -Math.PI, maxAngle: Math.PI },
          ],
          targetX: 100,
          targetY: 120,
          influence: 1,
          parameterMappings: [],
        },
      ],
      parameterBindings: [
        {
          id: "bind-target-x",
          parameterId: "p",
          target: {
            type: "ikController",
            controllerId: "ik-1",
            property: "targetX",
          },
          bindingPoints: [
            { paramValue: 0, targetValue: 100 },
            { paramValue: 1, targetValue: 180 },
          ],
        },
        {
          id: "bind-influence",
          parameterId: "p",
          target: {
            type: "ikController",
            controllerId: "ik-1",
            property: "influence",
          },
          bindingPoints: [
            { paramValue: 0, targetValue: 0 },
            { paramValue: 1, targetValue: 1 },
          ],
        },
      ] satisfies ParameterBinding[],
    });

    const result = evaluateBindings(
      project.parameterBindings,
      { p: 0.25 },
      project,
      createPrev(),
    );

    expect(result.ikTargetX["ik-1"]).toBe(120);
    expect(result.ikInfluence["ik-1"]).toBe(0.25);
  });
});
