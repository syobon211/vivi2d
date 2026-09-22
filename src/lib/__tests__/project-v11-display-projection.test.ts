import type { ParameterBinding } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  createBoneNode,
  createGroup,
  createIKController,
  createProject,
  createViviMesh,
} from "@/test/fixtures";
import { projectV11DisplayProjection } from "../project-v11-display-projection";

const binding = (
  id: string,
  target: ParameterBinding["target"],
  first: number,
  last: number,
): ParameterBinding => ({
  id,
  parameterId: "p",
  target,
  bindingPoints: [
    { paramValue: 0, targetValue: first },
    { paramValue: 1, targetValue: last },
  ],
});

describe("v11 display-only projection using existing additive evaluation", () => {
  it("combines paired properties from one authored snapshot and borrows unchanged geometry", () => {
    const bone = createBoneNode({
      id: "bone",
      x: 10,
      y: 20,
      bone: { angle: 90, length: 8, scaleX: 4, scaleY: 5 },
    });
    const mesh = createViviMesh();
    const group = createGroup({ children: [bone, mesh] });
    const controller = createIKController({
      id: "controller",
      targetX: 10,
      targetY: 20,
      influence: 0.5,
    });
    const project = createProject({
      layers: [group],
      ikControllers: [controller],
      parameterBindings: [
        binding("x", { type: "bone", boneId: bone.id, property: "x" }, 10, 30),
        binding("y", { type: "bone", boneId: bone.id, property: "y" }, 20, 40),
        binding("sx", { type: "bone", boneId: bone.id, property: "scaleX" }, 1, 2),
        binding("sy", { type: "bone", boneId: bone.id, property: "scaleY" }, 1, 3),
        binding("angle", { type: "bone", boneId: bone.id, property: "angle" }, 0, 45),
        binding("angle-add", { type: "bone", boneId: bone.id, property: "angle" }, 0, 15),
        ...(
          [
            ["targetX", 10, 21],
            ["targetY", 20, 34],
            ["poleTargetX", 0, 7],
            ["poleTargetY", 0, 8],
            ["influence", 0.5, 2],
          ] as const
        ).map(([property, first, last]) =>
          binding(
            property,
            {
              type: "ikController",
              controllerId: controller.id,
              property,
            },
            first,
            last,
          ),
        ),
      ],
    });
    const before = structuredClone(project);
    const display = projectV11DisplayProjection(project, { p: 1 });
    const displayedGroup = display.layers[0]!;
    if (!("children" in displayedGroup)) throw Error("expected group");
    const displayedBone = displayedGroup.children![0]!;
    if (displayedBone.kind !== "bone") throw Error("expected bone");
    expect([displayedBone.x, displayedBone.y]).toEqual([30, 40]);
    expect(displayedBone.bone).toEqual({ angle: 60, length: 8, scaleX: 2, scaleY: 3 });
    expect(display.ikControllers![0]).toEqual({
      ...controller,
      targetX: 21,
      targetY: 34,
      poleTargetX: 7,
      poleTargetY: 8,
      influence: 1,
    });
    expect(displayedGroup).not.toBe(group);
    expect(displayedGroup.children![1]).toBe(mesh);
    expect(project).toEqual(before);
  });

  it("keeps missing-parameter fallback and rejects nonfinite consumed input/output without changing source", () => {
    const bone = createBoneNode({ id: "bone" });
    const project = createProject({
      layers: [bone],
      parameterBindings: [
        binding("angle", { type: "bone", boneId: bone.id, property: "angle" }, 12, 24),
      ],
    });
    const result = projectV11DisplayProjection(project, {});
    expect(result.layers[0]?.kind === "bone" && result.layers[0].bone.angle).toBe(12);
    const before = structuredClone(project);
    expect(() => projectV11DisplayProjection(project, { p: Number.NaN })).toThrow(
      "PROJECT_DISPLAY_UNAVAILABLE",
    );
    expect(project).toEqual(before);
    project.parameterBindings![0]!.bindingPoints[0]!.targetValue = -Number.MAX_VALUE;
    project.parameterBindings![0]!.bindingPoints[1]!.targetValue = Number.MAX_VALUE;
    // Finite endpoints overflow inside the unchanged interpolation engine.
    expect(() => projectV11DisplayProjection(project, { p: 0.5 })).toThrow(
      "PROJECT_DISPLAY_UNAVAILABLE",
    );
    const unbound = createProject({ layers: [bone] });
    expect(projectV11DisplayProjection(unbound, {})).toBe(unbound);
  });
});
