import type { Dispatch, SetStateAction } from "react";
import type { ProjectData } from "@vivi2d/core/types";
import { createMotionHandleDraftFromProject } from "@vivi2d/editor-core/motion-handles";
import type { AutoSetupResult } from "@/lib/auto-setup";
import { getTexture } from "@/lib/texture-store";

export async function loadAutoSetupAcceptedManualMasks(project: ProjectData) {
  const { createAutoSetupAcceptedManualMasks } = await import(
    "@/lib/auto-setup-accepted-masks"
  );
  return createAutoSetupAcceptedManualMasks(project, getTexture);
}

export function restoreAutoSetupMotionHandleDraft(
  project: ProjectData,
  restoredResult: AutoSetupResult | null,
  setResult: Dispatch<SetStateAction<AutoSetupResult | null>>,
): void {
  void loadAutoSetupAcceptedManualMasks(project)
    .then((acceptedManualMasks) => {
      setResult((current) =>
        current === restoredResult && current
          ? {
              ...current,
              motionHandleDraft: createMotionHandleDraftFromProject(project, {
                acceptedManualMasks,
              }),
            }
          : current,
      );
    })
    .catch(() => undefined);
}
