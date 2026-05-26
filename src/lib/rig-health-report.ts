import { flattenLayers } from "@vivi2d/core/layer-utils";
import {
  type ValidationIssue,
  type ValidationSeverity,
  validateModel,
} from "@vivi2d/core/model-validation";
import {
  type LayerSemanticRole,
  type ProjectData,
  type ViviMeshNode,
  isBone,
  isViviMesh,
} from "@vivi2d/core/types";
import {
  planAnimationTrackCleanup,
  planParameterBindingCleanup,
  planSceneBlendCleanup,
  planStateMachineCleanup,
} from "@vivi2d/editor-core/rig-health-workflow-cleanup";
import {
  formatSeeThroughLayerIssue,
  formatSeeThroughProjectIssue,
} from "./see-through-quality-format";
import {
  buildSeeThroughQualityReport,
  type SeeThroughLayerIssue,
  type SeeThroughProjectIssue,
  type SeeThroughQualityReport,
} from "./see-through-quality-report";
import {
  buildSeeThroughSetupChecklist,
  summarizeSeeThroughMeshRefinement,
  summarizeSeeThroughSecondaryPhysics,
} from "./see-through-setup-checklist";

export type RigHealthIssueSource =
  | "validation"
  | "workflow"
  | "seeThroughProject"
  | "seeThroughLayer";

export type RigHealthWorkflowCode =
  | "missingSecondaryPhysics"
  | "needsMeshRefinement"
  | "needsEyeClipping"
  | "needsEyeRig"
  | "needsMouthRig"
  | "needsParameterBindingReview"
  | "needsStateMachineReview"
  | "needsSceneBlendReview"
  | "needsAnimationTrackReview";

export interface RigHealthIssue {
  id: string;
  source: RigHealthIssueSource;
  severity: ValidationSeverity;
  layerId?: string;
  layerName?: string;
  semanticRole?: LayerSemanticRole;
  clipId?: string;
  workflowCode?: RigHealthWorkflowCode;
  seeThroughCode?: SeeThroughProjectIssue["code"] | SeeThroughLayerIssue["code"];
  category: string;
  message: string;
  displayText: string;
}

export interface RigHealthSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: RigHealthIssue[];
}

interface BuildRigHealthSummaryOptions {
  seeThroughQualityReport?: SeeThroughQualityReport | null;
}

const SOURCE_RANK: Record<RigHealthIssueSource, number> = {
  validation: 0,
  workflow: 1,
  seeThroughProject: 2,
  seeThroughLayer: 3,
};

const SEVERITY_RANK: Record<ValidationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function fallbackRoleLabel(role: LayerSemanticRole): string {
  return role;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeWorkflowParts(parts: string[]): string {
  if (parts.length === 0) return "";
  return `(${parts.join(", ")}).`;
}

function collectProjectReferenceSets(project: ProjectData) {
  const layers = flattenLayers(project.layers);
  const boneIds = new Set(layers.filter(isBone).map((layer) => layer.id));
  const ikControllerToBoneId = new Map<string, string>();
  for (const controller of project.ikControllers ?? []) {
    const firstBoneId = controller.boneChain[0]?.boneId;
    if (firstBoneId && boneIds.has(firstBoneId)) {
      ikControllerToBoneId.set(controller.id, firstBoneId);
    }
  }
  return {
    boneIds,
    ikControllerToBoneId,
    sceneIds: new Set((project.scenes ?? []).map((scene) => scene.id)),
  };
}

function resolveParameterBindingLayerId(
  project: ProjectData,
  binding: NonNullable<ProjectData["parameterBindings"]>[number],
): string | undefined {
  const refs = collectProjectReferenceSets(project);
  if (binding.target.type === "bone") {
    return refs.boneIds.has(binding.target.boneId) ? binding.target.boneId : undefined;
  }
  return refs.ikControllerToBoneId.get(binding.target.controllerId);
}

function toValidationIssue(issue: ValidationIssue, index: number): RigHealthIssue {
  return {
    id: `validation:${issue.severity}:${issue.layerId ?? "_"}:${issue.category}:${issue.message}:${index}`,
    source: "validation",
    severity: issue.severity,
    layerId: issue.layerId,
    layerName: issue.layerName,
    category: issue.category,
    message: issue.message,
    displayText: `${issue.category}: ${issue.message}`,
  };
}

function toSeeThroughProjectIssue(
  issue: SeeThroughProjectIssue,
  index: number,
): RigHealthIssue {
  const message = formatSeeThroughProjectIssue(issue, fallbackRoleLabel);
  return {
    id: `seeThroughProject:${issue.severity}:${issue.code}:${issue.role ?? "_"}:${index}`,
    source: "seeThroughProject",
    severity: issue.severity,
    semanticRole: issue.code === "duplicateCriticalRole" ? issue.role : undefined,
    seeThroughCode: issue.code,
    category: "See-through Import",
    message,
    displayText: `See-through Import: ${message}`,
  };
}

function toSeeThroughLayerIssue(
  issue: SeeThroughLayerIssue,
  index: number,
): RigHealthIssue {
  const message = formatSeeThroughLayerIssue(issue);
  return {
    id: `seeThroughLayer:${issue.severity}:${issue.layerId}:${issue.code}:${index}`,
    source: "seeThroughLayer",
    severity: issue.severity,
    layerId: issue.layerId,
    seeThroughCode: issue.code,
    category: "See-through Layer",
    message,
    displayText: `See-through Layer: ${message}`,
  };
}

function flattenImportedSeeThroughViviMeshes(project: ProjectData): ViviMeshNode[] {
  return flattenLayers(project.layers).filter(
    (layer): layer is ViviMeshNode =>
      isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
}

function buildSecondaryPhysicsWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const importedViviMeshes = flattenImportedSeeThroughViviMeshes(project);
  const summary = summarizeSeeThroughSecondaryPhysics(importedViviMeshes, project);
  if (!summary.applicable || summary.status === "done" || summary.status === "na") {
    return null;
  }
  return {
    id: "workflow:missingSecondaryPhysics",
    source: "workflow",
    severity: summary.status === "pending" ? "warning" : "info",
    workflowCode: "missingSecondaryPhysics",
    category: "Secondary Physics",
    message: summary.detail,
    displayText: `Secondary Physics: ${summary.detail}`,
  };
}

function buildMeshRefinementWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const importedViviMeshes = flattenImportedSeeThroughViviMeshes(project);
  if (importedViviMeshes.length === 0) return null;
  const summary = summarizeSeeThroughMeshRefinement(importedViviMeshes);
  if (summary.status === "done") return null;
  return {
    id: "workflow:needsMeshRefinement",
    source: "workflow",
    severity: summary.status === "pending" ? "warning" : "info",
    workflowCode: "needsMeshRefinement",
    category: "Mesh Refinement",
    message: summary.detail,
    displayText: `Mesh Refinement: ${summary.detail}`,
  };
}

function buildFaceWorkflowIssues(project: ProjectData): RigHealthIssue[] {
  const checklist = buildSeeThroughSetupChecklist(project);
  if (!checklist.isSeeThroughProject) return [];
  const itemMap = new Map(checklist.items.map((item) => [item.id, item]));
  const specs: Array<{
    id: "eyeClipping" | "eyeRig" | "mouthRig";
    code: RigHealthWorkflowCode;
    category: string;
  }> = [
    { id: "eyeClipping", code: "needsEyeClipping", category: "Eye Clipping" },
    { id: "eyeRig", code: "needsEyeRig", category: "Eye Rig" },
    { id: "mouthRig", code: "needsMouthRig", category: "Mouth Rig" },
  ];

  const issues: RigHealthIssue[] = [];
  for (const spec of specs) {
    const item = itemMap.get(spec.id);
    if (
      !item ||
      item.status === "done" ||
      item.status === "na" ||
      item.status === "blocked"
    ) {
      continue;
    }
    issues.push({
      id: `workflow:${spec.code}`,
      source: "workflow",
      severity: item.status === "pending" ? "warning" : "info",
      workflowCode: spec.code,
      category: spec.category,
      message: item.detail,
      displayText: `${spec.category}: ${item.detail}`,
    });
  }
  return issues;
}

function buildParameterBindingWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const bindings = project.parameterBindings ?? [];
  if (bindings.length === 0) return null;
  const plan = planParameterBindingCleanup(project);
  if (plan.bindingIds.length === 0) return null;

  let layerId: string | undefined;
  for (const binding of bindings) {
    layerId ??= resolveParameterBindingLayerId(project, binding);
  }

  const detail = summarizeWorkflowParts([
    ...(plan.removedMissingParameterCount > 0
      ? [
          pluralize(
            plan.removedMissingParameterCount,
            "missing parameter",
            "missing parameters",
          ),
        ]
      : []),
    ...(plan.removedMissingTargetCount > 0
      ? [pluralize(plan.removedMissingTargetCount, "missing target", "missing targets")]
      : []),
    ...(plan.removedEmptyBindingCount > 0
      ? [pluralize(plan.removedEmptyBindingCount, "empty binding", "empty bindings")]
      : []),
  ]);

  return {
    id: "workflow:needsParameterBindingReview",
    source: "workflow",
    severity:
      plan.removedMissingParameterCount > 0 || plan.removedMissingTargetCount > 0
        ? "warning"
        : "info",
    layerId,
    workflowCode: "needsParameterBindingReview",
    category: "Parameter Binding",
    message: `Parameter bindings need review ${detail}`,
    displayText: `Parameter Binding: Parameter bindings need review ${detail}`,
  };
}

function buildStateMachineWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const machines = project.stateMachines ?? [];
  if (machines.length === 0) return null;
  const plan = planStateMachineCleanup(project);
  if (
    plan.initialStateFixes.length === 0 &&
    plan.clearedStateClipRefs.length === 0 &&
    plan.blendTreeReplacements.length === 0 &&
    plan.removedTransitions.length === 0 &&
    plan.removedConditions.length === 0
  ) {
    return null;
  }
  const staleClipCount =
    plan.clearedStateClipRefs.length +
    plan.prunedBlendTreeEntryCount +
    plan.blendTreeReplacements.filter((replacement) => replacement.blendTree === null)
      .length;
  const staleParameterCount =
    plan.removedConditions.reduce(
      (sum, replacement) => sum + replacement.indices.length,
      0,
    ) + plan.clearedBlendTreeCount;
  const detail = summarizeWorkflowParts([
    ...(plan.initialStateFixes.length > 0
      ? [
          pluralize(
            plan.initialStateFixes.length,
            "missing initial state",
            "missing initial states",
          ),
        ]
      : []),
    ...(staleClipCount > 0
      ? [pluralize(staleClipCount, "stale clip reference", "stale clip references")]
      : []),
    ...(staleParameterCount > 0
      ? [
          pluralize(
            staleParameterCount,
            "stale parameter reference",
            "stale parameter references",
          ),
        ]
      : []),
    ...(plan.removedTransitions.length > 0
      ? [
          pluralize(
            plan.removedTransitions.length,
            "broken transition",
            "broken transitions",
          ),
        ]
      : []),
  ]);
  return {
    id: "workflow:needsStateMachineReview",
    source: "workflow",
    severity: "warning",
    workflowCode: "needsStateMachineReview",
    category: "State Machine",
    message: `State machines need review ${detail}`,
    displayText: `State Machine: State machines need review ${detail}`,
  };
}

function buildSceneBlendWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const blends = project.sceneBlends ?? [];
  if (blends.length === 0) return null;
  const refs = collectProjectReferenceSets(project);
  const plan = planSceneBlendCleanup(project);
  let missingSceneCount = 0;
  let sameSceneCount = 0;
  for (const blend of blends) {
    if (!plan.removedBlendIds.includes(blend.id)) continue;
    const sourceExists = refs.sceneIds.has(blend.sourceSceneId);
    const targetExists = refs.sceneIds.has(blend.targetSceneId);
    if (!sourceExists || !targetExists) missingSceneCount += 1;
    if (blend.sourceSceneId === blend.targetSceneId) sameSceneCount += 1;
  }
  if (
    missingSceneCount === 0 &&
    sameSceneCount === 0 &&
    plan.normalizedDurationBlendIds.length === 0
  ) {
    return null;
  }
  const detail = summarizeWorkflowParts([
    ...(missingSceneCount > 0
      ? [
          pluralize(
            missingSceneCount,
            "missing scene reference",
            "missing scene references",
          ),
        ]
      : []),
    ...(sameSceneCount > 0
      ? [pluralize(sameSceneCount, "self-reference", "self-references")]
      : []),
    ...(plan.normalizedDurationBlendIds.length > 0
      ? [
          pluralize(
            plan.normalizedDurationBlendIds.length,
            "invalid duration",
            "invalid durations",
          ),
        ]
      : []),
  ]);
  return {
    id: "workflow:needsSceneBlendReview",
    source: "workflow",
    severity: "warning",
    workflowCode: "needsSceneBlendReview",
    category: "Scene Blend",
    message: `Scene blends need review ${detail}`,
    displayText: `Scene Blend: Scene blends need review ${detail}`,
  };
}

function flattenAllAnimationClips(project: ProjectData) {
  return [
    ...(project.clips ?? []),
    ...(project.scenes ?? []).flatMap((scene) => scene.clips),
  ];
}

function buildAnimationTrackWorkflowIssue(project: ProjectData): RigHealthIssue | null {
  const clips = flattenAllAnimationClips(project);
  if (clips.length === 0) return null;
  const plan = planAnimationTrackCleanup(project);
  if (plan.clipTargets.length === 0) return null;

  const detail = summarizeWorkflowParts([
    ...(plan.removedParameterTrackCount > 0
      ? [
          pluralize(
            plan.removedParameterTrackCount,
            "parameter track",
            "parameter tracks",
          ),
        ]
      : []),
    ...(plan.removedBoneTrackCount > 0
      ? [pluralize(plan.removedBoneTrackCount, "bone track", "bone tracks")]
      : []),
    ...(plan.removedImageSequenceTrackCount > 0
      ? [
          pluralize(
            plan.removedImageSequenceTrackCount,
            "image sequence track",
            "image sequence tracks",
          ),
        ]
      : []),
    ...(plan.removedIkControllerTrackCount > 0
      ? [
          pluralize(
            plan.removedIkControllerTrackCount,
            "IK controller track",
            "IK controller tracks",
          ),
        ]
      : []),
    ...(plan.removedLipSyncTrackCount > 0
      ? [pluralize(plan.removedLipSyncTrackCount, "lip sync track", "lip sync tracks")]
      : []),
    ...(plan.clearedLipSyncParameterTargetCount > 0
      ? [
          pluralize(
            plan.clearedLipSyncParameterTargetCount,
            "lip sync target",
            "lip sync targets",
          ),
        ]
      : []),
  ]);
  return {
    id: "workflow:needsAnimationTrackReview",
    source: "workflow",
    severity: "warning",
    clipId: plan.clipTargets[0]?.clipId,
    workflowCode: "needsAnimationTrackReview",
    category: "Animation Tracks",
    message: `Animation clips contain stale track references ${detail}`,
    displayText: `Animation Tracks: Animation clips contain stale track references ${detail}`,
  };
}

function sortRigHealthIssues(a: RigHealthIssue, b: RigHealthIssue): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    a.displayText.localeCompare(b.displayText)
  );
}

export function buildRigHealthSummary(
  project: ProjectData,
  options: BuildRigHealthSummaryOptions = {},
): RigHealthSummary {
  const validationIssues = validateModel(project).map(toValidationIssue);
  const seeThroughQualityReport =
    options.seeThroughQualityReport ?? buildSeeThroughQualityReport(project);
  const seeThroughProjectIssues = seeThroughQualityReport.projectIssues.map(
    toSeeThroughProjectIssue,
  );
  const seeThroughLayerIssues = Object.values(
    seeThroughQualityReport.layerIssues,
  ).flatMap((issues) => issues.map(toSeeThroughLayerIssue));
  const faceWorkflowIssues = buildFaceWorkflowIssues(project);
  const meshRefinementWorkflowIssue = buildMeshRefinementWorkflowIssue(project);
  const secondaryPhysicsWorkflowIssue = buildSecondaryPhysicsWorkflowIssue(project);
  const parameterBindingWorkflowIssue = buildParameterBindingWorkflowIssue(project);
  const stateMachineWorkflowIssue = buildStateMachineWorkflowIssue(project);
  const sceneBlendWorkflowIssue = buildSceneBlendWorkflowIssue(project);
  const animationTrackWorkflowIssue = buildAnimationTrackWorkflowIssue(project);
  const issues = [
    ...validationIssues,
    ...faceWorkflowIssues,
    ...(meshRefinementWorkflowIssue ? [meshRefinementWorkflowIssue] : []),
    ...(secondaryPhysicsWorkflowIssue ? [secondaryPhysicsWorkflowIssue] : []),
    ...(parameterBindingWorkflowIssue ? [parameterBindingWorkflowIssue] : []),
    ...(stateMachineWorkflowIssue ? [stateMachineWorkflowIssue] : []),
    ...(sceneBlendWorkflowIssue ? [sceneBlendWorkflowIssue] : []),
    ...(animationTrackWorkflowIssue ? [animationTrackWorkflowIssue] : []),
    ...seeThroughProjectIssues,
    ...seeThroughLayerIssues,
  ].sort(sortRigHealthIssues);

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount += 1;
    else if (issue.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }

  return { errorCount, warningCount, infoCount, issues };
}

export function buildRigHealthPreviewIssues(
  issues: readonly RigHealthIssue[],
  limit = 5,
): RigHealthIssue[] {
  if (limit <= 0 || issues.length === 0) return [];
  const buckets: Record<ValidationSeverity, RigHealthIssue[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const issue of issues) {
    buckets[issue.severity].push(issue);
  }
  const preview: RigHealthIssue[] = [];
  while (preview.length < limit) {
    let advanced = false;
    for (const severity of ["error", "warning", "info"] as const) {
      const next = buckets[severity].shift();
      if (!next) continue;
      preview.push(next);
      advanced = true;
      if (preview.length >= limit) break;
    }
    if (!advanced) break;
  }
  return preview;
}

export function canFocusRigHealthIssue(issue: RigHealthIssue): boolean {
  return (
    issue.layerId != null ||
    issue.semanticRole != null ||
    issue.clipId != null
  );
}
