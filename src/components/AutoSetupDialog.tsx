import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AutoSetupOptions,
  type AutoSetupResult,
  generateAutoMeshes,
  generateAutoWeights,
  previewAutoSetup,
} from "@/lib/auto-setup";
import { useI18nStore, useT } from "@/lib/i18n";
import { buildProjectLayerOcclusionCleanupPreviewReport } from "@/lib/layer-occlusion-cleanup";
import {
  getAutoSetupProjectBlockReasonKey,
  inferProjectSourceKind,
} from "@/lib/project-source-kind";
import { findSecondaryPhysicsTipBoneId } from "@/lib/secondary-physics-quick-action";
import {
  buildSeeThroughRigidWeightBindings,
  buildSeeThroughMotionRiskReport,
  buildSeeThroughSecondaryMotionBones,
  buildSeeThroughSecondaryMotionWeightBindings,
  SEE_THROUGH_RECOMMENDED_AUTO_SETUP_OPTIONS,
  summarizeSeeThroughAutoSetup,
} from "@/lib/see-through-auto-setup";
import {
  buildSeeThroughDepthRigHintSummary,
  type SeeThroughDepthRigHint,
} from "@/lib/see-through-depth-rig-hints";
import type { SeeThroughEyeClippingPlan } from "@vivi2d/editor-core/see-through-eye-clipping";
import type { SeeThroughEyeRigPlan } from "@vivi2d/editor-core/see-through-eye-rig";
import type { SeeThroughLeftRightSplitSummary } from "@vivi2d/editor-core/see-through-left-right-split";
import { buildSeeThroughMeshDensitySummary } from "@/lib/see-through-mesh-density";
import type { SeeThroughMouthRigPlan } from "@vivi2d/editor-core/see-through-mouth-rig";
import { formatSeeThroughProjectIssue } from "@/lib/see-through-quality-format";
import { buildSeeThroughQualityReport } from "@/lib/see-through-quality-report";
import type { SeeThroughReadyToRigCleanupSummary } from "@vivi2d/editor-core/see-through-ready-to-rig";
import { createFallbackAutoSetupSourceFingerprint } from "@vivi2d/editor-core/safe-auto-setup-plan";
import {
  buildSeeThroughSetupChecklist,
  type SeeThroughSetupChecklistItem,
} from "@/lib/see-through-setup-checklist";
import { getTexture } from "@/lib/texture-store";
import { useAutoSetupCommandStore } from "@/stores/autoSetupCommandStore";
import {
  type AutoSetupDialogStep,
  type AutoSetupDraft,
  type AutoSetupExperienceMode,
  buildAutoSetupDraftProjectKey,
  useAutoSetupDraftStore,
} from "@/stores/autoSetupDraftStore";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  runSeeThroughEyeClipping,
  runSeeThroughEyeRig,
  runSeeThroughLeftRightRepair,
  runSeeThroughMouthRig,
  runSeeThroughReadyToRigCleanup,
} from "@/stores/seeThroughAutoSetupWorkflow";
import { DialogShell } from "./DialogShell";
import { AutoSetupDialogSteps } from "./auto-setup/AutoSetupDialogSteps";
import {
  createDefaultAutoSetupOptions,
  createExcludedIdsCacheKey,
  hasMeaningfulAutoSetupDraft,
} from "./auto-setup/autoSetupDialogState";
import { useAutoSetupApplyCommand } from "./auto-setup/useAutoSetupApplyCommand";
import { loadAutoSetupAcceptedManualMasks, restoreAutoSetupMotionHandleDraft } from "./auto-setup/autoSetupAcceptedMasksLoader";
import { useAutoSetupQuickActions } from "./auto-setup/useAutoSetupQuickActions";
import { useAutoSetupResultReview } from "./auto-setup/useAutoSetupResultReview";

export function AutoSetupDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const project = useEditorStore((s) => s.project);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const projectStructureVersion = useEditorStore(
    (s) => s.projectStructureVersion,
  );
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const setAutoMeshBatch = useEditorStore((s) => s.setAutoMeshBatch);
  const openManualPngSplit = useProjectDialogsStore(
    (s) => s.openManualPngSplit,
  );
  const registryActions = useQuickActionRegistryStore((s) => s.actions);
  const saveDraft = useAutoSetupDraftStore((s) => s.saveDraft);
  const clearDraft = useAutoSetupDraftStore((s) => s.clearDraft);
  const getCompatibleDraft = useAutoSetupDraftStore(
    (s) => s.getCompatibleDraft,
  );
  const pendingQuickCommand = useAutoSetupCommandStore((s) => s.pendingCommand);
  const consumeCompatibleQuickCommand = useAutoSetupCommandStore(
    (s) => s.consumeCompatibleCommand,
  );
  const setQuickCommandInFlight = useAutoSetupCommandStore(
    (s) => s.setCommandInFlight,
  );
  const [step, setStep] = useState<AutoSetupDialogStep>("detect");
  const [experienceMode, setExperienceMode] =
    useState<AutoSetupExperienceMode>("beginner");
  const defaultOptions = useMemo(
    () => createDefaultAutoSetupOptions(project),
    [project?.sourceKind],
  );
  const [options, setOptions] = useState<AutoSetupOptions>(() =>
    createDefaultAutoSetupOptions(project),
  );
  const [result, setResult] = useState<AutoSetupResult | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [
    seeThroughRecommendationsApplied,
    setSeeThroughRecommendationsApplied,
  ] = useState(false);
  const [pendingRecommendedExclusionSeed, setPendingRecommendedExclusionSeed] =
    useState(false);
  const [cleanupSummary, setCleanupSummary] =
    useState<SeeThroughReadyToRigCleanupSummary | null>(null);
  const [eyeClippingSummary, setEyeClippingSummary] =
    useState<SeeThroughEyeClippingPlan | null>(null);
  const [eyeRigSummary, setEyeRigSummary] =
    useState<SeeThroughEyeRigPlan | null>(null);
  const [leftRightSplitSummary, setLeftRightSplitSummary] =
    useState<SeeThroughLeftRightSplitSummary | null>(null);
  const [mouthRigSummary, setMouthRigSummary] =
    useState<SeeThroughMouthRigPlan | null>(null);
  const [useOcclusionAwareMeshDensity, setUseOcclusionAwareMeshDensity] =
    useState(false);
  const [resumedFromDraft, setResumedFromDraft] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasCheckedDraftRef = useRef(false);
  const detectRequestIdRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const previewInFlightRef = useRef(false);
  const latestExcludedIdsRef = useRef(excludedIds);
  const suppressDraftPersistenceRef = useRef(false);
  const reviewAutoSetupResult = useAutoSetupResultReview(t);
  const { applying, handleApply, resetApplyState } = useAutoSetupApplyCommand({
    result,
    excludedIds,
    isMountedRef,
    clearDraft,
    onClose,
    onBeforeSuccessClose: () => {
      suppressDraftPersistenceRef.current = true;
    },
    t,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    latestExcludedIdsRef.current = excludedIds;
  }, [excludedIds]);

  const seeThroughSummary = useMemo(
    () => (project ? summarizeSeeThroughAutoSetup(project) : null),
    [project],
  );
  const isSeeThroughProject = seeThroughSummary?.isSeeThroughProject === true;
  const meshDensitySummary = useMemo(
    () => (project ? buildSeeThroughMeshDensitySummary(project) : null),
    [project],
  );
  const seeThroughQualityReport = useMemo(
    () => (project ? buildSeeThroughQualityReport(project) : null),
    [project],
  );
  const depthRigHintSummary = useMemo(
    () =>
      project
        ? buildSeeThroughDepthRigHintSummary(project, seeThroughQualityReport)
        : null,
    [project, seeThroughQualityReport],
  );
  const seeThroughSetupChecklist = useMemo(
    () =>
      project
    ? buildSeeThroughSetupChecklist(
        project,
        depthRigHintSummary,
        locale === "ja" ? "ja" : "en",
      )
        : null,
    [depthRigHintSummary, locale, project],
  );
  const projectIssueMessages = useMemo(
    () =>
      seeThroughQualityReport?.projectIssues.map((issue) =>
        formatSeeThroughProjectIssue(issue, (role) => role),
      ) ?? [],
    [seeThroughQualityReport],
  );
  const formatTemplate = useCallback(
    (template: string, params?: Record<string, string | number>) =>
      template.replace(/\{(\w+)\}/g, (_, key: string) =>
        String(params?.[key] ?? ""),
      ),
    [],
  );
  const formatDepthRigHint = useCallback(
    (hint: SeeThroughDepthRigHint): string => {
      return formatTemplate(t(hint.messageKey), hint.messageParams);
    },
    [formatTemplate, t],
  );
  const depthRigSummaryLabel = useMemo(
    () =>
      formatTemplate(t("seethrough.depthRig.summary"), {
        blocking: depthRigHintSummary?.counts.blocking ?? 0,
        warning: depthRigHintSummary?.counts.warning ?? 0,
        info: depthRigHintSummary?.counts.info ?? 0,
      }),
    [depthRigHintSummary, formatTemplate, t],
  );
  const depthInspectorAction = useMemo(() => {
    if (
      !depthRigHintSummary?.isSeeThroughProject ||
      depthRigHintSummary.hints.length === 0
    ) {
      return null;
    }
    const action = registryActions["project.depthInspector"];
    if (!action) return null;
    const availability = action.getAvailability();
    const firstLayerHint =
      depthRigHintSummary.hints.find((hint) => hint.layerId != null)?.layerId ??
      null;
    return {
      label: t("autoSetup.openDepthInspector"),
      enabled: availability.enabled,
      reason: availability.reason,
      run: () => {
        if (firstLayerHint) {
          useSelectionStore.getState().selectLayer(firstLayerHint);
        }
        action.run();
      },
    };
  }, [depthRigHintSummary, registryActions, t]);
  const physicsPanelAction = useMemo(() => {
    if (!seeThroughSetupChecklist?.isSeeThroughProject) {
      return null;
    }
    const action = registryActions["project.physicsPanel"];
    if (!action) return null;
    const availability = action.getAvailability();
    const suggestedTipBoneId = project
      ? findSecondaryPhysicsTipBoneId(project)
      : null;
    return {
      label: t("autoSetup.openPhysicsPanel"),
      enabled: availability.enabled,
      reason: availability.reason,
      run: () => {
        if (suggestedTipBoneId) {
          useSelectionStore.getState().selectLayer(suggestedTipBoneId);
        }
        action.run();
      },
    };
  }, [project, registryActions, seeThroughSetupChecklist, t]);
  const defaultUseOcclusionAwareMeshDensity = Boolean(
    meshDensitySummary?.isSeeThroughProject,
  );
  const draftProjectKey = useMemo(
    () =>
      project
        ? buildAutoSetupDraftProjectKey(
            project,
            currentFilePath,
            projectVersion,
          )
        : null,
    [currentFilePath, project, projectVersion],
  );
  const hasHiddenAdvancedSettings = useMemo(() => {
    return (
      experienceMode === "beginner" &&
      useOcclusionAwareMeshDensity !== defaultUseOcclusionAwareMeshDensity
    );
  }, [
    defaultUseOcclusionAwareMeshDensity,
    experienceMode,
    useOcclusionAwareMeshDensity,
  ]);
  const projectSourceKind = useMemo(
    () => (project ? inferProjectSourceKind(project) : "none"),
    [project],
  );
  const autoSetupBlockReasonKey = project
    ? getAutoSetupProjectBlockReasonKey(project, projectSourceKind)
    : null;
  const autoSetupDisabledReason = autoSetupBlockReasonKey
    ? t(autoSetupBlockReasonKey)
    : null;
  const sourceBlockAction = useMemo(
    () =>
      projectSourceKind === "manualPng"
        ? {
            label: t("manualPngSplit.open"),
            run: openManualPngSplit,
          }
        : null,
    [openManualPngSplit, projectSourceKind, t],
  );

  const resetWizardState = useCallback(() => {
    setStep("detect");
    setExperienceMode("beginner");
    setOptions(defaultOptions);
    setResult(null);
    setExcludedIds(new Set());
    setDetectError(null);
    setSeeThroughRecommendationsApplied(false);
    setPendingRecommendedExclusionSeed(false);
    setCleanupSummary(null);
    setEyeClippingSummary(null);
    setEyeRigSummary(null);
    setLeftRightSplitSummary(null);
    setMouthRigSummary(null);
    setUseOcclusionAwareMeshDensity(defaultUseOcclusionAwareMeshDensity);
    setResumedFromDraft(false);
    setPreviewing(false);
    resetApplyState();
    previewInFlightRef.current = false;
    previewRequestIdRef.current += 1;
  }, [defaultOptions, defaultUseOcclusionAwareMeshDensity, resetApplyState]);

  useEffect(() => {
    if (!project || !draftProjectKey || hasCheckedDraftRef.current) return;
    const draft = getCompatibleDraft(draftProjectKey, projectStructureVersion);
    if (draft) {
      const canRestoreMotionHandleDraft = draft.projectKey.includes(
        `source-${createFallbackAutoSetupSourceFingerprint(project)}`,
      );
      setStep(draft.step);
      setExperienceMode(draft.experienceMode);
      setOptions(draft.options);
      const restoredResult = draft.result && project
        ? { ...draft.result, motionHandleDraft: undefined }
        : draft.result;
      setResult(restoredResult);
      if (draft.result && project && canRestoreMotionHandleDraft) {
        restoreAutoSetupMotionHandleDraft(project, restoredResult, setResult);
      }
      setExcludedIds(new Set(draft.excludedIds));
      setSeeThroughRecommendationsApplied(
        draft.seeThroughRecommendationsApplied,
      );
      setCleanupSummary(draft.cleanupSummary);
      setEyeClippingSummary(draft.eyeClippingSummary);
      setEyeRigSummary(draft.eyeRigSummary);
      setLeftRightSplitSummary(draft.leftRightSplitSummary);
      setMouthRigSummary(draft.mouthRigSummary);
      setUseOcclusionAwareMeshDensity(draft.useOcclusionAwareMeshDensity);
      setResumedFromDraft(true);
    } else {
      setOptions(defaultOptions);
      setUseOcclusionAwareMeshDensity(defaultUseOcclusionAwareMeshDensity);
    }
    hasCheckedDraftRef.current = true;
  }, [
    defaultUseOcclusionAwareMeshDensity,
    draftProjectKey,
    defaultOptions,
    getCompatibleDraft,
    project,
    projectStructureVersion,
  ]);

  useEffect(() => {
    if (seeThroughSummary?.isSeeThroughProject) return;
    setSeeThroughRecommendationsApplied(false);
    setPendingRecommendedExclusionSeed(false);
    setCleanupSummary(null);
    setEyeClippingSummary(null);
    setEyeRigSummary(null);
    setLeftRightSplitSummary(null);
    setMouthRigSummary(null);
    setExcludedIds(new Set());
    setUseOcclusionAwareMeshDensity(false);
  }, [seeThroughSummary]);

  useEffect(() => {
    if (
      !project ||
      !draftProjectKey ||
      !hasCheckedDraftRef.current ||
      detecting ||
      suppressDraftPersistenceRef.current
    ) {
      return;
    }

    if (
      !hasMeaningfulAutoSetupDraft(
        step,
        experienceMode,
        options,
        excludedIds,
        result,
        seeThroughRecommendationsApplied,
        cleanupSummary,
        eyeClippingSummary,
        eyeRigSummary,
        leftRightSplitSummary,
        mouthRigSummary,
        useOcclusionAwareMeshDensity,
        defaultUseOcclusionAwareMeshDensity,
        defaultOptions,
      )
    ) {
      clearDraft();
      return;
    }

    const draft: AutoSetupDraft = {
      projectKey: draftProjectKey,
      projectStructureVersion,
      step,
      experienceMode,
      options,
      excludedIds: [...excludedIds],
      result,
      seeThroughRecommendationsApplied,
      cleanupSummary,
      eyeClippingSummary,
      eyeRigSummary,
      leftRightSplitSummary,
      mouthRigSummary,
      useOcclusionAwareMeshDensity,
    };
    saveDraft(draft);
  }, [
    cleanupSummary,
    clearDraft,
    defaultUseOcclusionAwareMeshDensity,
    defaultOptions,
    detecting,
    draftProjectKey,
    excludedIds,
    eyeClippingSummary,
    eyeRigSummary,
    leftRightSplitSummary,
    mouthRigSummary,
    options,
    project,
    projectStructureVersion,
    result,
    saveDraft,
    seeThroughRecommendationsApplied,
    step,
    experienceMode,
    useOcclusionAwareMeshDensity,
  ]);

  const applyRecommendedExclusions = useCallback(() => {
    setExcludedIds(
      new Set(seeThroughSummary?.recommendedExcludedLayerIds ?? []),
    );
    setPendingRecommendedExclusionSeed(false);
  }, [seeThroughSummary]);

  const handleApplySeeThroughRecommendations = useCallback(() => {
    setOptions((current) => ({
      ...current,
      ...SEE_THROUGH_RECOMMENDED_AUTO_SETUP_OPTIONS,
    }));
    setSeeThroughRecommendationsApplied(true);
    setPendingRecommendedExclusionSeed(true);
  }, []);

  const runDetect = useCallback(
    async (
      projectForDetect: typeof project,
      optionsForDetect: AutoSetupOptions,
      exclusionSeed: string[] | null,
    ) => {
      if (!projectForDetect) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = detectRequestIdRef.current + 1;
      detectRequestIdRef.current = requestId;

      setDetecting(true);
      setDetectError(null);
      setDetectProgress(null);

      try {
        const acceptedManualMasks =
          await loadAutoSetupAcceptedManualMasks(projectForDetect);
        const r = previewAutoSetup(projectForDetect, {
          ...optionsForDetect,
          labelLocale: locale === "ja" ? "ja" : "en",
          acceptedManualMasks,
        });
        const occlusionCleanupReport =
          buildProjectLayerOcclusionCleanupPreviewReport(projectForDetect);
        r.occlusionCleanupReport = occlusionCleanupReport.isEligible
          ? occlusionCleanupReport
          : null;
        const motionRiskReport =
          buildSeeThroughMotionRiskReport(projectForDetect);
        r.motionRiskReport =
          motionRiskReport.isSeeThroughProject &&
          motionRiskReport.layerReports.length > 0
            ? motionRiskReport
            : null;

        if (optionsForDetect.generateBones && r.boneResult) {
          const secondaryMotionBones = buildSeeThroughSecondaryMotionBones(projectForDetect, r.boneResult.bones, locale === "ja" ? "ja" : "en");
          if (secondaryMotionBones.length > 0) {
            r.boneResult = {
              ...r.boneResult,
              bones: [...r.boneResult.bones, ...secondaryMotionBones],
            };
          }
        }

        if (optionsForDetect.generateMeshes) {
          r.meshResults = await generateAutoMeshes(
            projectForDetect,
            getTexture,
            optionsForDetect.meshPreset ?? "standard",
            {
              presetOverrides:
                meshDensitySummary?.isSeeThroughProject &&
                useOcclusionAwareMeshDensity
                  ? meshDensitySummary.presetByLayerId
                  : undefined,
              signal: controller.signal,
              onProgress: (current, total, label) =>
                setDetectProgress({ current, total, label }),
            },
          );
        }

        if (
          optionsForDetect.generateBones &&
          optionsForDetect.generateMeshes &&
          optionsForDetect.generateWeights &&
          r.boneResult &&
          r.meshResults.length > 0
        ) {
          const rigidLayerBoneIds = buildSeeThroughRigidWeightBindings(
            projectForDetect,
            r.boneResult.bones,
          );
          const secondaryMotionBindings =
            buildSeeThroughSecondaryMotionWeightBindings(
              projectForDetect,
              r.boneResult.bones,
              motionRiskReport,
            );
          r.weightResults = await generateAutoWeights(
            r.meshResults,
            r.boneResult.bones,
            undefined,
            {
              rigidLayerBoneIds,
              secondaryMotionBindings,
              signal: controller.signal,
              onProgress: (current, total, label) =>
                setDetectProgress({ current, total, label }),
            },
          );
        }

        const reviewedResult = await reviewAutoSetupResult(
          projectForDetect,
          r,
          new Set(exclusionSeed ?? []),
        );

        if (
          controller.signal.aborted ||
          detectRequestIdRef.current !== requestId ||
          !isMountedRef.current
        ) {
          return;
        }

        setResult(reviewedResult);
        if (exclusionSeed) {
          setExcludedIds(new Set(exclusionSeed));
        }
        setPendingRecommendedExclusionSeed(false);
        setStep("options");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setDetectError(err instanceof Error ? err.message : String(err));
      } finally {
        if (detectRequestIdRef.current === requestId && isMountedRef.current) {
          setDetecting(false);
          setDetectProgress(null);
          abortRef.current = null;
        }
      }
    },
    [locale, meshDensitySummary, reviewAutoSetupResult, useOcclusionAwareMeshDensity],
  );

  const handleDetect = useCallback(async () => {
    if (!project) return;
    if (autoSetupDisabledReason) {
      setDetectError(autoSetupDisabledReason);
      return;
    }
    setCleanupSummary(null);
    const exclusionSeed = pendingRecommendedExclusionSeed
      ? (seeThroughSummary?.recommendedExcludedLayerIds ?? [])
      : null;
    await runDetect(project, options, exclusionSeed);
  }, [
    autoSetupDisabledReason,
    pendingRecommendedExclusionSeed,
    project,
    runDetect,
    options,
    seeThroughSummary,
  ]);

  const handleReadyToRig = useCallback(async () => {
    if (!project || !seeThroughSummary?.isSeeThroughProject) {
      await handleDetect();
      return;
    }

    const nextCleanupSummary = runSeeThroughReadyToRigCleanup();
    if (!nextCleanupSummary) return;

    const updatedProject = useEditorStore.getState().project;
    const updatedSummary = updatedProject
      ? summarizeSeeThroughAutoSetup(updatedProject)
      : null;
    const nextOptions = {
      ...options,
      ...SEE_THROUGH_RECOMMENDED_AUTO_SETUP_OPTIONS,
    };

    setCleanupSummary(nextCleanupSummary);
    setOptions(() => nextOptions);
    setSeeThroughRecommendationsApplied(true);
    setPendingRecommendedExclusionSeed(false);
    setExcludedIds(new Set(updatedSummary?.recommendedExcludedLayerIds ?? []));

    await runDetect(
      updatedProject,
      nextOptions,
      updatedSummary?.recommendedExcludedLayerIds ?? [],
    );
  }, [handleDetect, options, project, runDetect, seeThroughSummary]);

  const handleApplyAutomaticEyeClipping = useCallback(() => {
    if (!project || !seeThroughSummary?.isSeeThroughProject) return;

    const nextEyeClippingSummary = runSeeThroughEyeClipping();
    if (!nextEyeClippingSummary) return;

    setEyeClippingSummary(nextEyeClippingSummary);
  }, [project, seeThroughSummary]);

  const handleApplySeeThroughEyeRig = useCallback(() => {
    if (!project || !seeThroughSummary?.isSeeThroughProject) return;

    const nextEyeRigSummary = runSeeThroughEyeRig();
    if (!nextEyeRigSummary) return;

    setEyeRigSummary(nextEyeRigSummary);
  }, [project, seeThroughSummary]);

  const handleApplySeeThroughLeftRightRepair = useCallback(() => {
    if (!project || !seeThroughSummary?.isSeeThroughProject) return;

    const nextLeftRightSplitSummary = runSeeThroughLeftRightRepair();
    if (!nextLeftRightSplitSummary) return;

    setLeftRightSplitSummary(nextLeftRightSplitSummary);
  }, [project, seeThroughSummary]);

  const handleApplySeeThroughMouthRig = useCallback(() => {
    if (!project || !seeThroughSummary?.isSeeThroughProject) return;

    const nextMouthRigSummary = runSeeThroughMouthRig();
    if (!nextMouthRigSummary) return;

    setMouthRigSummary(nextMouthRigSummary);
  }, [project, seeThroughSummary]);

  const handleApplySeeThroughMeshRefinement = useCallback(() => {
    if (!project || !meshDensitySummary?.isSeeThroughProject) return;
    const importedLayerIds = Object.keys(meshDensitySummary.presetByLayerId);
    if (importedLayerIds.length === 0) return;
    setAutoMeshBatch(
      importedLayerIds,
      options.meshPreset ?? "standard",
      useOcclusionAwareMeshDensity
        ? meshDensitySummary.presetByLayerId
        : undefined,
    );
  }, [
    meshDensitySummary,
    options.meshPreset,
    project,
    setAutoMeshBatch,
    useOcclusionAwareMeshDensity,
  ]);

  const getSeeThroughChecklistAction = useCallback(
    (item: SeeThroughSetupChecklistItem) => {
      if (!seeThroughSummary?.isSeeThroughProject) return null;
      switch (item.id) {
        case "cleanup":
          return item.status === "done" || item.status === "na"
            ? null
            : { label: t("autoSetup.readyToRig"), run: handleReadyToRig };
        case "roles":
          return item.status === "done" || item.status === "na"
            ? null
            : {
                label: t("autoSetup.repairLeftRightRoles"),
                run: handleApplySeeThroughLeftRightRepair,
              };
        case "mesh":
          return item.status === "done" || item.status === "na"
            ? null
            : {
                label: t("quickActions.action.refineImportedMeshes.title"),
                run: handleApplySeeThroughMeshRefinement,
              };
        case "eyeClipping":
          return item.status === "done" || item.status === "na"
            ? null
            : {
                label: t("autoSetup.applyEyeClipping"),
                run: handleApplyAutomaticEyeClipping,
              };
        case "eyeRig":
          return item.status === "done" || item.status === "na"
            ? null
            : {
                label: t("autoSetup.createEyeRig"),
                run: handleApplySeeThroughEyeRig,
              };
        case "depth":
          return item.status === "done" ||
            item.status === "na" ||
            !depthInspectorAction
            ? null
            : {
                label: depthInspectorAction.label,
                run: depthInspectorAction.run,
                enabled: depthInspectorAction.enabled,
                reason: depthInspectorAction.reason,
              };
        case "mouthRig":
          return item.status === "done" || item.status === "na"
            ? null
            : {
                label: t("autoSetup.createMouthRig"),
                run: handleApplySeeThroughMouthRig,
              };
        case "physics":
          return item.status === "done" ||
            item.status === "na" ||
            !physicsPanelAction
            ? null
            : {
                label: physicsPanelAction.label,
                run: physicsPanelAction.run,
                enabled: physicsPanelAction.enabled,
                reason: physicsPanelAction.reason,
              };
        default:
          return null;
      }
    },
    [
      handleApplyAutomaticEyeClipping,
      handleApplySeeThroughMeshRefinement,
      handleApplySeeThroughEyeRig,
      handleApplySeeThroughLeftRightRepair,
      handleApplySeeThroughMouthRig,
      handleReadyToRig,
      physicsPanelAction,
      seeThroughSummary,
      depthInspectorAction,
      t,
    ],
  );

  useAutoSetupQuickActions({
    isSeeThroughProject,
    locale,
    draftProjectKey,
    projectStructureVersion,
    pendingQuickCommand,
    consumeCompatibleQuickCommand,
    setQuickCommandInFlight,
    handlers: {
      readyToRig: handleReadyToRig,
      meshRefine: handleApplySeeThroughMeshRefinement,
      eyeClipping: handleApplyAutomaticEyeClipping,
      eyeRig: handleApplySeeThroughEyeRig,
      leftRightRepair: handleApplySeeThroughLeftRightRepair,
      mouthRig: handleApplySeeThroughMouthRig,
    },
  });

  const handleStartOver = useCallback(() => {
    clearDraft();
    resetWizardState();
  }, [clearDraft, resetWizardState]);

  const handlePreview = useCallback(() => {
    void (async () => {
      if (!project || !result) {
        return;
      }
      if (previewInFlightRef.current) return;
      previewInFlightRef.current = true;
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;
      const excludedIdsKey = createExcludedIdsCacheKey(excludedIds);
      setDetectError(null);
      setPreviewing(true);
      try {
        const reviewedResult = await reviewAutoSetupResult(
          project,
          result,
          excludedIds,
        );
        if (!isMountedRef.current || previewRequestIdRef.current !== requestId) {
          return;
        }
        if (createExcludedIdsCacheKey(latestExcludedIdsRef.current) !== excludedIdsKey) {
          setDetectError(t("autoSetup.previewStale"));
          return;
        }
        setResult(reviewedResult);
        setStep("preview");
      } catch (err) {
        if (isMountedRef.current && previewRequestIdRef.current === requestId) {
          setDetectError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (previewRequestIdRef.current === requestId) {
          previewInFlightRef.current = false;
          if (isMountedRef.current) {
            setPreviewing(false);
          }
        }
      }
    })();
  }, [excludedIds, project, result, reviewAutoSetupResult]);

  const toggleExclude = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!project) return null;

  const detectSeeThroughActions = isSeeThroughProject
    ? {
        onReadyToRig: handleReadyToRig,
        onApplyAutomaticEyeClipping: handleApplyAutomaticEyeClipping,
        onApplySeeThroughEyeRig: handleApplySeeThroughEyeRig,
        onApplySeeThroughLeftRightRepair: handleApplySeeThroughLeftRightRepair,
        onApplySeeThroughMouthRig: handleApplySeeThroughMouthRig,
      }
    : {};

  return (
    <DialogShell
      onClose={onClose}
      title={t("autoSetup.title")}
      className="auto-setup-dialog"
      disableEscape={detecting}
    >
      <div className="auto-setup-body scrollbar-thin">
        {resumedFromDraft && (
          <div className="auto-setup-recommendation-note" role="status">
            <p>{t("autoSetup.resumed")}</p>
            <button
              type="button"
              className="modal-btn"
              onClick={handleStartOver}
            >
              {t("autoSetup.startOver")}
            </button>
          </div>
        )}
        <AutoSetupDialogSteps
          detectError={detectError}
          detecting={detecting}
          detectProgress={detectProgress}
          step={step}
          t={t}
          detectStep={{
            options,
            setOptions,
            experienceMode,
            onChangeExperienceMode: setExperienceMode,
            onDetect: handleDetect,
            ...detectSeeThroughActions,
            seeThroughSummary,
            eyeClippingSummary,
            eyeRigSummary,
            leftRightSplitSummary,
            mouthRigSummary,
            seeThroughSetupChecklist,
            seeThroughQualityReport,
            depthRigHintSummary,
            depthRigSummaryLabel,
            formatDepthRigHint,
            depthInspectorAction,
            formatProjectIssue: (index) => projectIssueMessages[index] ?? "",
            recommendationsApplied: seeThroughRecommendationsApplied,
            onApplySeeThroughRecommendations:
              handleApplySeeThroughRecommendations,
            getChecklistAction: getSeeThroughChecklistAction,
            meshDensitySummary,
            useOcclusionAwareMeshDensity,
            onToggleOcclusionAwareMeshDensity:
              setUseOcclusionAwareMeshDensity,
            hasHiddenAdvancedSettings,
            sourceBlockReason: autoSetupDisabledReason,
            sourceBlockAction,
            busy: detecting,
          }}
          optionsStep={
            result
              ? {
                  result,
                  excludedIds,
                  onToggleExclude: toggleExclude,
                  seeThroughSummary,
                  cleanupSummary,
                  recommendationsApplied: seeThroughRecommendationsApplied,
                  onRestoreRecommendedExclusions: applyRecommendedExclusions,
                  onBack: () => setStep("detect"),
                  onPreview: handlePreview,
                  isPreviewing: previewing,
                }
              : null
          }
          previewStep={
            result
              ? {
                  result,
                  onResultChange: setResult,
                  onBack: () => setStep("options"),
                  onApply: handleApply,
                  isApplying: applying,
                }
              : null
          }
        />
      </div>
    </DialogShell>
  );
}
