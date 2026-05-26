import type { LayerSemanticRole } from "@vivi2d/core/types";
import type {
  QuickActionAvailability,
  QuickActionRegistration,
} from "@/stores/quickActionRegistryStore";
import { t as tGlobal } from "./i18n";
import type { RigHealthIssue } from "./rig-health-report";

export interface RigHealthAutoSetupRepairAction {
  id: string;
  label: string;
  action: QuickActionRegistration;
  availability: QuickActionAvailability;
}

const EMPTY_MESH_CATEGORY = "emptyMesh";
const OUT_OF_BOUNDS_MESH_INDEX_CATEGORY = "meshIndexBounds";
const ORPHAN_SKIN_CATEGORY = "orphanSkin";
const UNBOUND_VERTICES_CATEGORY = "unboundVertices";
const WEIGHT_NORMALIZATION_CATEGORY = "weightNormalization";
const UNUSED_BONE_CATEGORY = "unusedBone";

function isEyeSideRole(role: LayerSemanticRole | undefined): boolean {
  return role === "eyeLeft" || role === "eyeRight";
}

export function resolveRigHealthAutoSetupRepairId(issue: RigHealthIssue): string | null {
  if (
    issue.source === "validation" &&
    (issue.category === EMPTY_MESH_CATEGORY ||
      issue.category === OUT_OF_BOUNDS_MESH_INDEX_CATEGORY) &&
    issue.layerId
  ) {
    return "layer.autoMesh.standard";
  }
  if (
    issue.source === "validation" &&
    issue.category === UNBOUND_VERTICES_CATEGORY &&
    issue.layerId
  ) {
    return "layer.skinAutoWeights";
  }
  if (
    issue.source === "validation" &&
    issue.category === WEIGHT_NORMALIZATION_CATEGORY &&
    issue.layerId
  ) {
    return "layer.normalizeSkinWeights";
  }
  if (
    issue.source === "validation" &&
    issue.category === UNUSED_BONE_CATEGORY &&
    issue.layerId
  ) {
    return "layer.removeSelectedBone";
  }
  if (issue.source === "validation" && issue.category === ORPHAN_SKIN_CATEGORY) {
    return "project.cleanupOrphanSkins";
  }
  if (issue.source === "workflow" && issue.workflowCode === "missingSecondaryPhysics") {
    return "project.physicsPanel";
  }
  if (
    issue.source === "workflow" &&
    issue.workflowCode === "needsParameterBindingReview"
  ) {
    return "project.cleanupParameterBindings";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsStateMachineReview") {
    return "project.cleanupStateMachines";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsSceneBlendReview") {
    return "project.cleanupSceneBlends";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsAnimationTrackReview") {
    return "project.cleanupAnimationTracks";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsMeshRefinement") {
    return "menu.autoSetup.meshRefine";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsEyeClipping") {
    return "menu.autoSetup.eyeClipping";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsEyeRig") {
    return "menu.autoSetup.eyeRig";
  }
  if (issue.source === "workflow" && issue.workflowCode === "needsMouthRig") {
    return "menu.autoSetup.mouthRig";
  }
  if (issue.source === "seeThroughLayer") {
    if (issue.seeThroughCode === "unknownSemanticRole") {
      return "menu.autoSetup.readyToRig";
    }
    if (issue.seeThroughCode === "leftRightConflict") {
      return "menu.autoSetup.leftRightRepair";
    }
    if (
      issue.seeThroughCode === "frontBackUnknown" ||
      issue.seeThroughCode === "invalidBBox" ||
      issue.seeThroughCode === "invalidDepthStats"
    ) {
      return "project.depthInspector";
    }
    return null;
  }
  if (
    issue.source === "seeThroughProject" &&
    issue.seeThroughCode === "duplicateCriticalRole" &&
    isEyeSideRole(issue.semanticRole)
  ) {
    return "menu.autoSetup.leftRightRepair";
  }
  return null;
}

export function resolveRigHealthAutoSetupRepair(
  issue: RigHealthIssue,
  registryActions: Record<string, QuickActionRegistration>,
): RigHealthAutoSetupRepairAction | null {
  const id = resolveRigHealthAutoSetupRepairId(issue);
  if (!id) return null;
  const action = registryActions[id];
  if (!action) return null;

  let label = tGlobal("prop.rigHealth.repair.openInAutoSetup");
  switch (id) {
    case "project.depthInspector":
      label = tGlobal("prop.rigHealth.repair.openDepthInspector");
      break;
    case "project.physicsPanel":
      label = tGlobal("prop.rigHealth.repair.openPhysicsPanel");
      break;
    case "project.cleanupParameterBindings":
      label = tGlobal("prop.rigHealth.repair.cleanParameterBindings");
      break;
    case "project.cleanupStateMachines":
      label = tGlobal("prop.rigHealth.repair.cleanStateMachines");
      break;
    case "project.cleanupSceneBlends":
      label = tGlobal("prop.rigHealth.repair.cleanSceneBlends");
      break;
    case "project.cleanupAnimationTracks":
      label = tGlobal("prop.rigHealth.repair.cleanAnimationTracks");
      break;
    case "layer.autoMesh.standard":
      label = tGlobal("prop.rigHealth.repair.rebuildMesh");
      break;
    case "layer.skinAutoWeights":
      label = tGlobal("prop.rigHealth.repair.autoWeightMesh");
      break;
    case "layer.normalizeSkinWeights":
      label = tGlobal("prop.rigHealth.repair.normalizeSkinWeights");
      break;
    case "layer.removeSelectedBone":
      label = tGlobal("prop.rigHealth.repair.deleteSelectedBone");
      break;
    case "project.cleanupOrphanSkins":
      label = tGlobal("prop.rigHealth.repair.removeOrphanSkins");
      break;
  }

  return {
    id,
    label,
    action,
    availability: action.getAvailability(),
  };
}
