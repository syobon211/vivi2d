import type { Template } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applyTemplate } from "../template-command";
import { createProject } from "./fixtures";

describe("template command", () => {
  it("applies parameter templates and links paired parameters", () => {
    const project = createProject();
    const template: Template = {
      id: "params",
      name: "Params",
      category: "parameter",
      description: "Parameter template",
      data: {
        type: "parameter",
        entries: [
          {
            name: "Face X",
            minValue: -30,
            maxValue: 30,
            defaultValue: 0,
            pairedName: "Face Y",
          },
          { name: "Face Y", minValue: -30, maxValue: 30, defaultValue: 0 },
        ],
      },
    };

    expect(applyTemplate(project, template)).toEqual({ added: 2, skipped: 0 });
    expect(project.parameters).toHaveLength(2);
    expect(project.parameters[0]?.pairedParameterId).toBe(project.parameters[1]?.id);
  });

  it("clones physics templates before writing into the project", () => {
    const project = createProject();
    const template: Template = {
      id: "physics",
      name: "Physics",
      category: "physics",
      description: "Physics template",
      data: {
        type: "physics",
        groups: [
          {
            name: "Hair",
            enabled: true,
            pendulums: [{ length: 1, mass: 1, damping: 0.1 }],
            inputs: [{ type: "x", parameterId: "p", weight: 1 }],
            outputs: [{ type: "angle", parameterId: "out", pendulumIndex: 0, weight: 1 }],
            gravityDirection: 0,
            gravityStrength: 9.8,
            wind: 0,
          },
        ],
      },
    };

    const result = applyTemplate(project, template);
    if (template.data.type === "physics") {
      template.data.groups[0]!.pendulums[0]!.mass = 99;
    }

    expect(result.groupIds).toHaveLength(1);
    expect(project.physicsGroups[0]?.pendulums[0]?.mass).toBe(1);
  });

  it("clones lipsync viseme mappings before writing into the project", () => {
    const project = createProject();
    const template: Template = {
      id: "lipsync",
      name: "LipSync",
      category: "lipsync",
      description: "Lip sync template",
      data: {
        type: "lipsync",
        config: {
          enabled: true,
          mode: "viseme",
          visemeMappings: [
            { viseme: "aa", target: { type: "parameter", parameterId: "mouth", value: 1 } },
          ],
        },
      },
    };

    applyTemplate(project, template);
    if (template.data.type === "lipsync") {
      template.data.config.visemeMappings![0]!.target.parameterId = "changed";
    }

    expect(project.lipsyncConfig.visemeMappings?.[0]?.target.parameterId).toBe("mouth");
  });
});
