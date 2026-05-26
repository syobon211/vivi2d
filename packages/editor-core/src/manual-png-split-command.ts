import { findLayerById } from "@vivi2d/core/layer-utils";
import type { GroupNode, ProjectData } from "@vivi2d/core/types";

export interface ManualPngSplitApplyPlan {
  sourceLayerId: string;
  group: GroupNode;
  selectedLayerId?: string;
}

export interface ManualPngSplitApplyResult {
  hiddenSourceLayer: boolean;
  insertedGroupId: string;
  selectedLayerId?: string;
}

export function applyManualPngSplitPlan(
  project: ProjectData,
  plan: ManualPngSplitApplyPlan,
): ManualPngSplitApplyResult {
  const original = findLayerById(project.layers, plan.sourceLayerId);
  if (original) {
    original.visible = false;
  }

  const insertedGroup = structuredClone(plan.group);
  project.sourceKind = "manualPng";
  project.layers.push(insertedGroup);

  return {
    hiddenSourceLayer: original != null,
    insertedGroupId: insertedGroup.id,
    selectedLayerId: plan.selectedLayerId,
  };
}
