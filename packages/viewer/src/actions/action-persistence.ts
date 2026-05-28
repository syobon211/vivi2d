import { z } from "zod";
import {
  assertImportedActionSafe,
  type ViviAction,
  type ViviActionTrigger,
  parseViviAction,
} from "./action-types";
import { parseViviActionTriggers } from "./action-bindings";

export interface ViviActionExport {
  version: 1;
  actions: ViviAction[];
  triggers: ViviActionTrigger[];
}

const actionExportSchema = z.object({
  version: z.literal(1),
  actions: z.array(z.unknown()).max(256),
  triggers: z.array(z.unknown()).max(512).optional().catch(undefined),
});

export interface ImportActionsOptions {
  reviewedScriptActionIds?: ReadonlySet<string>;
  reviewedCalibrationActionIds?: ReadonlySet<string>;
}

function isReviewedImportedAction(
  action: ViviAction,
  options: ImportActionsOptions,
): boolean {
  if (action.kind === "scriptCommand") {
    return Boolean(options.reviewedScriptActionIds?.has(action.id));
  }
  if (
    action.kind === "calibrationProfileApply" ||
    action.kind === "calibrationCaptureNeutral" ||
    action.kind === "calibrationReset"
  ) {
    return Boolean(options.reviewedCalibrationActionIds?.has(action.id));
  }
  return false;
}

export function exportActions(
  actions: readonly ViviAction[],
  triggers: readonly ViviActionTrigger[] = [],
): string {
  return JSON.stringify(
    {
      version: 1,
      actions,
      triggers,
    },
    null,
    2,
  );
}

export function importActions(
  json: string,
  options: ImportActionsOptions = {},
): ViviActionExport | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  const parsed = actionExportSchema.safeParse(data);
  if (!parsed.success) return null;

  try {
    const actions = parsed.data.actions.map((input) => {
      const action = parseViviAction({ ...(input as object), source: "imported" });
      assertImportedActionSafe(action, options);
      return isReviewedImportedAction(action, options)
        ? { ...action, source: "user" as const }
        : action;
    });
    const triggers = parsed.data.triggers
      ? parseViviActionTriggers(parsed.data.triggers)
      : [];
    return { version: 1, actions, triggers };
  } catch {
    return null;
  }
}
