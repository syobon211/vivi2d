import type { LayerSemanticRole } from "@vivi2d/core/types";
import type {
  SeeThroughLayerIssue,
  SeeThroughProjectIssue,
} from "./see-through-quality-report";

export function formatSeeThroughProjectIssue(
  issue: SeeThroughProjectIssue,
  getRoleLabel: (role: LayerSemanticRole) => string,
): string {
  switch (issue.code) {
    case "missingHeadOrFace":
      return "Face/head layers are missing.";
    case "missingEyeLeft":
      return "A left eye layer is missing.";
    case "missingEyeRight":
      return "A right eye layer is missing.";
    case "missingMouth":
      return "Mouth layers are missing.";
    case "missingBody":
      return "Body layers are missing.";
    case "duplicateCriticalRole":
      return issue.role
        ? `${getRoleLabel(issue.role)} appears multiple times.`
        : "A critical role appears multiple times.";
    default:
      return issue.code;
  }
}

export function formatSeeThroughLayerIssue(issue: SeeThroughLayerIssue): string {
  switch (issue.code) {
    case "unknownSemanticRole":
      return "This layer does not have a semantic role.";
    case "lowConfidenceRole":
      return "This layer was imported with low confidence.";
    case "leftRightConflict":
      return "The role conflicts with the imported left/right hint.";
    case "frontBackUnknown":
      return "The imported front/back hint is unknown.";
    case "invalidBBox":
      return "The imported bounds are invalid.";
    case "invalidDepthStats":
      return "The imported depth stats are invalid.";
    default:
      return issue.code;
  }
}
