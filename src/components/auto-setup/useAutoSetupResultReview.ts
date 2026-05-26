import { useCallback, useRef } from "react";
import {
  type AutoSetupResult,
  buildSafeAutoSetupPlan,
  createAutoSetupSourceFingerprint,
} from "@/lib/auto-setup";
import type { ProjectData } from "@vivi2d/core/types";
import {
  compileLayerGraphSafeAutoSetupPlan,
} from "@vivi2d/editor-core/layer-graph-safe-plan";
import { getTexture } from "@/lib/texture-store";
import { guardAutoSetupWeightResults } from "@/lib/auto-setup-preservation-guard";
import {
  createExcludedIdsCacheKey,
  isUnsupportedAuditHashHostError,
} from "./autoSetupDialogState";
import type { I18nKey } from "@/lib/i18n";

export function useAutoSetupResultReview(
  t: (key: I18nKey) => string,
): (
  projectForPlan: ProjectData,
  resultForPlan: AutoSetupResult,
  currentExcludedIds: ReadonlySet<string>,
) => Promise<AutoSetupResult> {
  const reviewedResultCacheRef = useRef<
    Map<
      string,
      {
        sourceResult: AutoSetupResult;
        reviewedResult: AutoSetupResult;
      }
    >
  >(new Map());

  return useCallback(
    async (
      projectForPlan: ProjectData,
      resultForPlan: AutoSetupResult,
      currentExcludedIds: ReadonlySet<string>,
    ): Promise<AutoSetupResult> => {
      const excludedIdsKey = createExcludedIdsCacheKey(currentExcludedIds);
      const cache = reviewedResultCacheRef.current;
      const cached = cache.get(excludedIdsKey);
      if (
        cached &&
        (cached.sourceResult === resultForPlan || cached.reviewedResult === resultForPlan)
      ) {
        return cached.reviewedResult;
      }
      const reviewedResult: AutoSetupResult = { ...resultForPlan };
      const preservationGuard = guardAutoSetupWeightResults(
        projectForPlan,
        resultForPlan,
        currentExcludedIds,
      );
      const planInput: AutoSetupResult = {
        ...reviewedResult,
        weightResults: preservationGuard.weightResults,
      };
      reviewedResult.plan = buildSafeAutoSetupPlan(projectForPlan, planInput, {
        excludedIds: currentExcludedIds,
        sourceFingerprint:
          resultForPlan.plan?.sourceFingerprint ??
          (await createAutoSetupSourceFingerprint(projectForPlan, {
            getTexture,
          })),
      });
      if (reviewedResult.layerGraph && reviewedResult.plan) {
        let compiled: Awaited<ReturnType<typeof compileLayerGraphSafeAutoSetupPlan>>;
        try {
          compiled = await compileLayerGraphSafeAutoSetupPlan(
            {
              layerGraph: reviewedResult.layerGraph,
              plan: reviewedResult.plan,
            },
            {
              excludedSourceLayerIds: currentExcludedIds,
            },
          );
        } catch (err) {
          if (isUnsupportedAuditHashHostError(err)) {
            throw new Error(t("autoSetup.unsupportedHost"));
          }
          const message = err instanceof Error ? err.message : String(err);
          const gateDetails = reviewedResult.layerGraph.quality.gateResults
            .filter((gate) => gate.status === "fail" || gate.status === "notRun")
            .map((gate) => `${gate.id}:${gate.status}`)
            .join(", ");
          throw new Error(
            gateDetails
              ? `Layer Graph Safe Plan failed: ${message} (${gateDetails})`
              : `Layer Graph Safe Plan failed: ${message}`,
          );
        }
        reviewedResult.plan = compiled.plan;
        reviewedResult.auditTrace = compiled.auditTrace;
      }
      if (!cache.has(excludedIdsKey) && cache.size >= 8) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(excludedIdsKey, {
        sourceResult: resultForPlan,
        reviewedResult,
      });
      return reviewedResult;
    },
    [t],
  );
}
