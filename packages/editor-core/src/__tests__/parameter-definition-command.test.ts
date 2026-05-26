import { describe, expect, it } from "vitest";
import {
  addParameterDefinition,
  pairParameterDefinitions,
  removeParameterDefinition,
  setParameterDefinitionGroup,
  unpairParameterDefinition,
  updateParameterDefinition,
} from "../parameter-definition-command";
import { createProject } from "./fixtures";

describe("parameter definition commands", () => {
  it("adds, updates, groups, pairs, and unpairs parameters", () => {
    const project = createProject();

    const parameterAId = addParameterDefinition(
      project,
      {
        name: "Face X",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
        group: "",
      },
      () => "param-a",
    );
    const parameterBId = addParameterDefinition(
      project,
      {
        name: "Face Y",
        minValue: -1,
        maxValue: 1,
        defaultValue: 0,
        group: "Face",
      },
      () => "param-b",
    );

    expect(parameterAId).toBe("param-a");
    expect(project.parameters[0]?.group).toBeUndefined();
    expect(updateParameterDefinition(project, parameterAId, { name: "Head X" }))
      .toBe(true);
    expect(setParameterDefinitionGroup(project, parameterAId, "Head")).toBe(true);
    expect(pairParameterDefinitions(project, parameterAId, parameterBId)).toBe(true);
    expect(project.parameters[0]).toMatchObject({
      name: "Head X",
      group: "Head",
      pairedParameterId: parameterBId,
    });
    expect(unpairParameterDefinition(project, parameterAId)).toBe(true);
    expect(project.parameters[0]?.pairedParameterId).toBeUndefined();
    expect(project.parameters[1]?.pairedParameterId).toBeUndefined();
  });

  it("removes pair links and bindings when a parameter is deleted", () => {
    const project = createProject({
      parameters: [
        {
          id: "param-a",
          name: "A",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
          pairedParameterId: "param-b",
        },
        {
          id: "param-b",
          name: "B",
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
          pairedParameterId: "param-a",
        },
      ],
      parameterBindings: [
        {
          id: "binding-a",
          parameterId: "param-a",
          target: { type: "bone", boneId: "bone-a", property: "x" },
          bindingPoints: [],
        },
      ],
    });

    expect(removeParameterDefinition(project, "param-a")).toBe(true);

    expect(project.parameters.map((parameter) => parameter.id)).toEqual(["param-b"]);
    expect(project.parameters[0]?.pairedParameterId).toBeUndefined();
    expect(project.parameterBindings).toEqual([]);
  });
});
