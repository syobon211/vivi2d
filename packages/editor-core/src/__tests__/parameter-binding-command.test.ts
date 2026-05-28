import { describe, expect, it } from "vitest";
import {
  addParameterBinding,
  blendParameterBindingPoints,
  getParameterBindingPoints,
  removeParameterBinding,
  removeParameterBindingPoint,
  removeParameterBindingsByParameter,
  replaceParameterBindingPoints,
  replaceParameterBindingPointsMirrored,
  setParameterBindingPoint,
} from "../parameter-binding-command";
import { createProject } from "./fixtures";

describe("parameter binding commands", () => {
  it("adds, edits, copies, mirrors, blends, and removes binding points", () => {
    const project = createProject();

    const bindingId = addParameterBinding(
      project,
      "param-a",
      { type: "bone", boneId: "bone-a", property: "x" },
      () => "binding-a",
    );

    expect(bindingId).toBe("binding-a");
    expect(setParameterBindingPoint(project, bindingId, 1, 10)).toBe(true);
    expect(setParameterBindingPoint(project, bindingId, -1, -10)).toBe(true);
    expect(project.parameterBindings?.[0]?.bindingPoints).toEqual([
      { paramValue: -1, targetValue: -10 },
      { paramValue: 1, targetValue: 10 },
    ]);

    const copied = getParameterBindingPoints(project, bindingId)!;
    copied[0]!.targetValue = -20;
    expect(project.parameterBindings?.[0]?.bindingPoints[0]?.targetValue).toBe(-10);

    expect(
      replaceParameterBindingPointsMirrored(project, bindingId, copied),
    ).toBe(true);
    expect(project.parameterBindings?.[0]?.bindingPoints).toEqual([
      { paramValue: -1, targetValue: -10 },
      { paramValue: 1, targetValue: 20 },
    ]);

    expect(
      replaceParameterBindingPoints(project, bindingId, [
        { paramValue: 0, targetValue: 4 },
      ]),
    ).toBe(true);
    expect(
      blendParameterBindingPoints(
        project,
        bindingId,
        [{ paramValue: 0, targetValue: 10 }],
        0.5,
      ),
    ).toBe(true);
    expect(project.parameterBindings?.[0]?.bindingPoints).toEqual([
      { paramValue: 0, targetValue: 7 },
    ]);

    expect(removeParameterBindingPoint(project, bindingId, 0)).toBe(true);
    expect(project.parameterBindings?.[0]?.bindingPoints).toEqual([]);
    expect(removeParameterBinding(project, bindingId)).toBe(true);
    expect(project.parameterBindings).toEqual([]);
  });

  it("removes bindings by parameter and preserves the old empty-array side effect", () => {
    const project = createProject();

    expect(removeParameterBindingsByParameter(project, "missing")).toBe(0);
    expect(project.parameterBindings).toEqual([]);

    addParameterBinding(
      project,
      "param-a",
      { type: "bone", boneId: "bone-a", property: "x" },
      () => "binding-a",
    );
    addParameterBinding(
      project,
      "param-b",
      { type: "bone", boneId: "bone-b", property: "y" },
      () => "binding-b",
    );

    expect(removeParameterBindingsByParameter(project, "param-a")).toBe(1);
    expect(project.parameterBindings?.map((binding) => binding.id)).toEqual([
      "binding-b",
    ]);
  });
});
