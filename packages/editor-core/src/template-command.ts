import { applyTemplate as applyCoreTemplate } from "@vivi2d/core/templates";
import type { ProjectData, Template } from "@vivi2d/core/types";

export type TemplateApplyResult = {
  added?: number;
  skipped?: number;
  groupIds?: string[];
};

function assertNever(value: never): never {
  throw new Error(`Unhandled template data: ${JSON.stringify(value)}`);
}

function cloneTemplate(template: Template): Template {
  switch (template.data.type) {
    case "parameter":
      return {
        ...template,
        data: {
          type: "parameter",
          entries: template.data.entries.map((entry) => ({ ...entry })),
        },
      };
    case "physics":
      return {
        ...template,
        data: {
          type: "physics",
          groups: template.data.groups.map((group) => ({
            ...group,
            pendulums: group.pendulums.map((pendulum) => ({ ...pendulum })),
            inputs: group.inputs.map((input) => ({ ...input })),
            outputs: group.outputs.map((output) => ({ ...output })),
          })),
        },
      };
    case "lipsync":
      return {
        ...template,
        data: {
          type: "lipsync",
          config: {
            ...template.data.config,
            visemeMappings: template.data.config.visemeMappings?.map((mapping) => ({
              ...mapping,
              target: { ...mapping.target },
            })),
          },
        },
      };
  }
  return assertNever(template.data);
}

export function applyTemplate(
  project: ProjectData,
  template: Template,
): TemplateApplyResult {
  return applyCoreTemplate(project, cloneTemplate(template));
}
