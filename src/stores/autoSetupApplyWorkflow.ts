import { applySafeAutoSetupPlanToProject } from "@vivi2d/editor-core/auto-setup-apply-command";
import type { AutoSetupAuditTrace } from "@vivi2d/editor-core/layer-graph";
import {
  SafeAutoSetupAuditHashUnsupportedError,
  compileLayerGraphSafeAutoSetupPlan,
} from "@vivi2d/editor-core/layer-graph-safe-plan";
import {
  PublicProfileError,
  assertPublicProjectProfile,
} from "@vivi2d/model/public-profile";
import {
  type AutoSetupResult,
  buildSafeAutoSetupPlan,
} from "@/lib/auto-setup";
import { guardAutoSetupWeightResults } from "@/lib/auto-setup-preservation-guard";
import { useEditorStore } from "@/stores/editorStore";
import {
  bumpProjectStructureVersion,
  mutateProject,
  runInHistoryTransaction,
} from "@/stores/projectMutator";

export type AutoSetupApplyStatus =
  | "applied"
  | "noProject"
  | "unsupportedHost"
  | "planUnsupported"
  | "applyFailed";

export interface AutoSetupApplyRequest {
  result: AutoSetupResult;
  excludedIds?: ReadonlySet<string>;
  /** Future review gate hook; defaults to false so BBW weights stay held. */
  allowBbwSolver?: boolean;
}

export interface AutoSetupApplyResult {
  status: AutoSetupApplyStatus;
  skippedManagedObjects: string[];
  skippedRiskyWeightLayerIds: string[];
  auditTrace?: AutoSetupAuditTrace;
}

function emptyResult(status: AutoSetupApplyStatus): AutoSetupApplyResult {
  return {
    status,
    skippedManagedObjects: [],
    skippedRiskyWeightLayerIds: [],
  };
}

export async function applyAutoSetupResult({
  result,
  excludedIds = new Set<string>(),
  allowBbwSolver = false,
}: AutoSetupApplyRequest): Promise<AutoSetupApplyResult> {
  const project = useEditorStore.getState().project;
  if (!project) return emptyResult("noProject");

  const preservationGuard = guardAutoSetupWeightResults(
    project,
    result,
    excludedIds,
  );
  const planResult: AutoSetupResult = {
    ...result,
    weightResults: preservationGuard.weightResults,
  };

  let plan;
  let auditTrace: AutoSetupAuditTrace | undefined;
  try {
    plan = buildSafeAutoSetupPlan(project, planResult, {
      excludedIds,
      sourceFingerprint: result.plan?.sourceFingerprint,
      allowBbwSolver,
    });
    if (result.layerGraph) {
      const compiled = await compileLayerGraphSafeAutoSetupPlan(
        {
          layerGraph: result.layerGraph,
          plan,
        },
        {
          excludedSourceLayerIds: excludedIds,
          allowBbwSolver,
        },
      );
      auditTrace = compiled.auditTrace;
      if (
        result.auditTrace?.safePlanHash &&
        auditTrace.safePlanHash !== result.auditTrace.safePlanHash
      ) {
        return emptyResult("planUnsupported");
      }
    }
  } catch (err) {
    if (err instanceof SafeAutoSetupAuditHashUnsupportedError) {
      return emptyResult("unsupportedHost");
    }
    return emptyResult("planUnsupported");
  }

  let skippedManagedObjects: string[] = [];
  let appliedMeshOrWeightChanges = false;
  try {
    runInHistoryTransaction(() => {
      mutateProject((draftProject) => {
        const applyResult = applySafeAutoSetupPlanToProject(draftProject, plan);
        skippedManagedObjects = applyResult.skippedManagedObjects;
        appliedMeshOrWeightChanges =
          applyResult.appliedMeshOrWeightChanges;
      });
      const appliedProject = useEditorStore.getState().project;
      if (appliedProject) {
        // Still inside runInHistoryTransaction, but validate the plain store
        // snapshot rather than the Immer draft proxy.
        assertPublicProjectProfile(appliedProject);
      }
      if (appliedMeshOrWeightChanges) {
        bumpProjectStructureVersion();
      }
    });
  } catch (err) {
    return emptyResult(
      err instanceof PublicProfileError ? "planUnsupported" : "applyFailed",
    );
  }

  return {
    status: "applied",
    skippedManagedObjects,
    skippedRiskyWeightLayerIds: preservationGuard.skippedWeightLayerIds,
    auditTrace,
  };
}
