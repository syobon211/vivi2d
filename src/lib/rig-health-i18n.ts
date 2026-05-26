import type { LayerSemanticRole } from "@vivi2d/core/types";
import type { I18nKey } from "./i18n";
import type { RigHealthIssue, RigHealthWorkflowCode } from "./rig-health-report";

function formatTemplate(
  template: string,
  params: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(params[key] ?? ""),
  );
}

function extractQuotedName(message: string): string {
  return message.match(/"([^"]+)"/)?.[1] ?? "";
}

function extractNumber(message: string, pattern: RegExp): string {
  return message.match(pattern)?.[1] ?? "";
}

function semanticRoleLabel(
  t: (key: I18nKey) => string,
  role: LayerSemanticRole | undefined,
): string {
  return role ? t(`prop.semanticRole.${role}` as I18nKey) : "";
}

const WORKFLOW_MESSAGE_KEYS = {
  missingSecondaryPhysics: "prop.rigHealth.message.workflow.missingSecondaryPhysics",
  needsMeshRefinement: "prop.rigHealth.message.workflow.needsMeshRefinement",
  needsEyeClipping: "prop.rigHealth.message.workflow.needsEyeClipping",
  needsEyeRig: "prop.rigHealth.message.workflow.needsEyeRig",
  needsMouthRig: "prop.rigHealth.message.workflow.needsMouthRig",
  needsParameterBindingReview:
    "prop.rigHealth.message.workflow.needsParameterBindingReview",
  needsStateMachineReview: "prop.rigHealth.message.workflow.needsStateMachineReview",
  needsSceneBlendReview: "prop.rigHealth.message.workflow.needsSceneBlendReview",
  needsAnimationTrackReview:
    "prop.rigHealth.message.workflow.needsAnimationTrackReview",
} as const satisfies Record<RigHealthWorkflowCode, I18nKey>;

const SEE_THROUGH_MESSAGE_KEYS = {
  missingHeadOrFace: "prop.rigHealth.message.seeThrough.missingHeadOrFace",
  missingEyeLeft: "prop.rigHealth.message.seeThrough.missingEyeLeft",
  missingEyeRight: "prop.rigHealth.message.seeThrough.missingEyeRight",
  missingMouth: "prop.rigHealth.message.seeThrough.missingMouth",
  missingBody: "prop.rigHealth.message.seeThrough.missingBody",
  duplicateCriticalRole:
    "prop.rigHealth.message.seeThrough.duplicateCriticalRole",
  unknownSemanticRole: "prop.rigHealth.message.seeThrough.unknownSemanticRole",
  lowConfidenceRole: "prop.rigHealth.message.seeThrough.lowConfidenceRole",
  leftRightConflict: "prop.rigHealth.message.seeThrough.leftRightConflict",
  frontBackUnknown: "prop.rigHealth.message.seeThrough.frontBackUnknown",
  invalidBBox: "prop.rigHealth.message.seeThrough.invalidBBox",
  invalidDepthStats: "prop.rigHealth.message.seeThrough.invalidDepthStats",
} as const satisfies Record<string, I18nKey>;

function formatValidationMessage(
  t: (key: I18nKey) => string,
  issue: RigHealthIssue,
): string | null {
  const layerName = issue.layerName ?? extractQuotedName(issue.message);
  switch (issue.category) {
    case "unusedBone":
      return formatTemplate(t("prop.rigHealth.message.validation.unusedBone"), {
        name: layerName,
      });
    case "weightNormalization":
      return formatTemplate(
        t("prop.rigHealth.message.validation.weightNormalization"),
        {
          name: layerName,
          count: extractNumber(issue.message, /has (\d+) unnormalized/),
        },
      );
    case "unboundVertices": {
      const counts = issue.message.match(/has (\d+)\/(\d+) unbound/);
      return formatTemplate(t("prop.rigHealth.message.validation.unboundVertices"), {
        name: layerName,
        count: counts?.[1],
        total: counts?.[2],
      });
    }
    case "emptyMesh":
      return formatTemplate(
        issue.message.includes("no indices")
          ? t("prop.rigHealth.message.validation.emptyMeshNoIndices")
          : t("prop.rigHealth.message.validation.emptyMeshNoVertices"),
        { name: layerName },
      );
    case "meshIndexBounds":
      return formatTemplate(t("prop.rigHealth.message.validation.meshIndexBounds"), {
        name: layerName,
        index: extractNumber(issue.message, /index (-?\d+)/),
      });
    case "orphanSkin":
      return formatTemplate(t("prop.rigHealth.message.validation.orphanSkin"), {
        id: issue.layerId ?? extractQuotedName(issue.message),
      });
    default:
      return null;
  }
}

export function formatRigHealthIssueMessage(
  t: (key: I18nKey) => string,
  issue: RigHealthIssue,
): string {
  const validationMessage = formatValidationMessage(t, issue);
  if (validationMessage) return validationMessage;

  if (issue.workflowCode) {
    return t(WORKFLOW_MESSAGE_KEYS[issue.workflowCode]);
  }

  if (issue.seeThroughCode) {
    const key = SEE_THROUGH_MESSAGE_KEYS[issue.seeThroughCode];
    if (key) {
      return formatTemplate(t(key), {
        role: semanticRoleLabel(t, issue.semanticRole),
      });
    }
  }

  return issue.message;
}
