import { generateThumbnail, type ParticleEffectType } from "@vivi2d/renderer-pixi";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ViviActionScope, ViviActionTriggerSource } from "./actions/action-types";
import {
  createViewerIssueFromMessage,
  deriveViewerWorkflowModel,
  resetSuppressionsOnEvent,
  type ViewerRecommendationKey,
  type ViewerSheetSection,
} from "./components/viewer-workflow";
import { COLLIDER_EFFECT_MAP } from "./constants";
import { mapControllerEventToViewerApiEvents } from "./api/viewer-api-event-mapper";
import { useCamerasList } from "./hooks/useCamerasList";
import { useExpressionPresetHotkeys } from "./hooks/useExpressionPresetHotkeys";
import { useHitIndicator } from "./hooks/useHitIndicator";
import { useInputDevices } from "./hooks/useInputDevices";
import { useLipSync } from "./hooks/useLipSync";
import { useLocaleToggle } from "./hooks/useLocaleToggle";
import { useModelSession } from "./hooks/useModelSession";
import { useRecorder } from "./hooks/useRecorder";
import { useScriptRunner } from "./hooks/useScriptRunner";
import { useToast } from "./hooks/useToast";
import { useViewerApiEventPublisher } from "./hooks/useViewerApiEventPublisher";
import { useViewerApiRendererBridge } from "./hooks/useViewerApiRendererBridge";
import { useViewerApiStatus } from "./hooks/useViewerApiStatus";
import { useTrackingOrchestrator } from "./hooks/useTrackingOrchestrator";
import { useViewerLoop } from "./hooks/useViewerLoop";
import { useViewerState } from "./hooks/useViewerState";
import { ViewerRecorder } from "./recorder";
import { ViviViewerController } from "./controller/viewer-controller";
import { useViewerOverlayActions } from "./props/useViewerOverlayActions";
import {
  downloadConfig,
  importConfig,
  loadSettings,
  type TrackingConfig,
  updateSettings,
} from "./settings";
import { ViewerShellFrame } from "./shell/ViewerShellFrame";
import { ViewerStage, type ReadinessWarning } from "./shell/ViewerStage";
import { createViewerSideSheetSections } from "./panels/ViewerSideSheetSections";

export default function App() {
  const { locale, t, setLocale } = useLocaleToggle();

  const viewerState = useViewerState();
  const {
    loaded,
    error,
    setError,
    modelName,
    dragging,
    tracking,
    handTracking,
    poseTracking,
    lipSync,
    bgMode,
    setBgMode,
    alwaysOnTop,
    setAlwaysOnTop,
    smoothing,
    setSmoothing,
    selectedCamera,
    setSelectedCamera,
    lipSyncMode,
    setLipSyncMode,
    recordingFormat,
    setRecordingFormat,
    colliderEffects,
    setColliderEffects,
    trackingMapRef,
    platformFaceMapRef,
    handTrackingMapRef,
    poseTrackingMapRef,
    mappedCount,
    platformFaceMappedCount,
    handMappedCount,
    poseMappedCount,
    showHud,
    setShowHud,
    hudStats,
    setHudStats,
    panelOpen,
    setPanelOpen,
    currentVowel,
    setCurrentVowel,
    recordingState,
    recordingElapsed,
    gamepadActive,
    midiActive,
    showHudRef,
    smoothingRef,
  } = viewerState;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<ViewerRecorder | null>(null);
  const controllerRef = useRef<ViviViewerController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new ViviViewerController();
  }
  const viewerController = controllerRef.current;
  const { status: viewerApiStatus } = useViewerApiStatus();
  const [activeSheetSection, setActiveSheetSection] =
    useState<ViewerSheetSection>("session");
  const [suppressedRecommendations, setSuppressedRecommendations] = useState(
    viewerState.initialSettings?.recommendationSuppressions ?? {},
  );
  const [readinessWarnings, setReadinessWarnings] = useState<ReadinessWarning[]>(
    [],
  );
  const calibrationProcessorRef = useRef({
    processFrame: viewerController.processTrackingFrame.bind(viewerController),
  });
  const [viewerProps, setViewerProps] = useState(
    viewerController.snapshot().props,
  );
  const [calibrationSnapshot, setCalibrationSnapshot] = useState(
    viewerController.snapshot().calibration,
  );
  const applyTrackingParameters = useCallback((values: Record<string, number>) => {
    void viewerController.dispatch({
      type: "signals.set",
      values,
      scopes: ["write:signals"],
      source: "tracking",
    });
  }, [viewerController]);

  const applyLipSyncParameters = useCallback((values: Record<string, number>) => {
    void viewerController.dispatch({
      type: "signals.set",
      values,
      scopes: ["write:signals"],
      source: "lipSync",
    });
  }, [viewerController]);
  const applyInputDeviceParameters = useCallback(
    (values: Record<string, number>) => {
      void viewerController.dispatch({
        type: "signals.set",
        values,
        scopes: ["write:signals"],
        source: "inputDevice",
      });
    },
    [viewerController],
  );

  const {
    modelRef,
    rendererRef,
    particlesRef,
    loading: modelLoading,
    handleFileLoad,
    handleUrlLoad,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useModelSession({
    canvasRef,
    recorderRef,
    recorderFactory: (canvas) => new ViewerRecorder(canvas),
    state: viewerState,
    t,
  });

  const { toggleTracking, toggleHandTracking, togglePoseTracking } =
    useTrackingOrchestrator({
      applyParameters: applyTrackingParameters,
      calibrationProcessorRef,
      state: viewerState,
      t,
    });

  const { cameras } = useCamerasList();
  const { lastHit, showHit } = useHitIndicator();
  const {
    scriptInput,
    setScriptInput,
    scriptRunning,
    runScript: handleRunScript,
  } = useScriptRunner(modelRef);
  const { toast, showToast } = useToast();
  const overlayActions = useViewerOverlayActions({
    viewerController,
    viewerProps,
    showToast,
  });
  const publishViewerApiEvents = useViewerApiEventPublisher();

  const runTrustedAction = useCallback(
    (
      action: unknown,
      options: {
        triggerSource?: ViviActionTriggerSource;
        scopes: readonly ViviActionScope[];
      },
    ) => {
      void viewerController.runAction(action, {
        ...options,
        trustedTriggerSource: true,
      });
    },
    [viewerController],
  );

  useEffect(() => {
    return viewerController.subscribe((event) => {
      if (event.type === "viewer.snapshot.changed") {
        setViewerProps(event.snapshot.props);
        setCalibrationSnapshot(event.snapshot.calibration);
      }
      publishViewerApiEvents(mapControllerEventToViewerApiEvents(event));
    });
  }, [publishViewerApiEvents, viewerController]);

  const { lipSyncVolumeRef, lipSyncVowelRef, toggleLipSync } = useLipSync({
    state: viewerState,
    t,
  });

  const { toggleRecording } = useRecorder({
    recorderRef,
    state: viewerState,
    t,
  });

  useEffect(() => {
    viewerController.setActionCapabilities({
      getParameters: (ids) => {
        const values: Record<string, number | undefined> = {};
        const model = modelRef.current;
        for (const id of ids) values[id] = model?.parameterValues[id];
        return values;
      },
      setParameters: (values) => modelRef.current?.setParameters(values),
      applyExpressionPreset: (id) => modelRef.current?.applyExpressionPreset(id),
      playEffectPreset: (id) =>
        particlesRef.current?.play(id as ParticleEffectType),
      setPropTransform: (id, transform) => {
        void viewerController.dispatch({
          type: "props.patchTransform",
          propId: id,
          transform,
          scopes: ["write:props"],
        });
      },
      setPropVisible: (id, visible) => {
        void viewerController.dispatch({
          type: "props.setVisible",
          propId: id,
          visible,
          scopes: ["write:props"],
        });
      },
      cycleProps: (groupId, direction) => {
        void viewerController.dispatch({
          type: "props.cycleGroup",
          groupId,
          direction,
          scopes: ["write:props"],
        });
      },
      spawnPropBurst: (propIds) => {
        void viewerController.dispatch({
          type: "props.spawnBurst",
          propIds,
          scopes: ["write:props"],
        });
      },
      applyCalibrationProfile: (id) => {
        void viewerController.dispatch({
          type: "calibration.applyProfile",
          profileId: id,
          scopes: ["write:calibration"],
        });
      },
      captureCalibrationNeutral: (source) => {
        void viewerController.dispatch({
          type: "calibration.captureNeutral",
          source,
          scopes: ["write:calibration"],
        });
      },
      resetCalibration: (profileId) => {
        void viewerController.dispatch({
          type: "calibration.reset",
          profileId,
          scopes: ["write:calibration"],
        });
      },
      setRecording: async (state) => {
        if (
          state === "toggle" ||
          (state === "start" && recordingState === "idle") ||
          (state === "stop" && recordingState === "recording")
        ) {
          await toggleRecording();
        }
      },
    });
  }, [
    modelRef,
    particlesRef,
    recordingState,
    toggleRecording,
    viewerController,
  ]);

  const playEffect = useCallback((type: ParticleEffectType) => {
    runTrustedAction(
      {
        id: `effect-${type}`,
        name: type,
        kind: "effectPreset",
        enabled: true,
        payload: { effectId: type },
        cooldownMs: 100,
        queuePolicy: "drop",
        source: "builtIn",
      },
      { triggerSource: "ui", scopes: ["run:actions:safe"] },
    );
  }, [runTrustedAction]);

  const { toggleGamepad, toggleMidi } = useInputDevices({
    applyParameters: applyInputDeviceParameters,
    state: viewerState,
    t,
  });

  const handleExportConfig = useCallback(() => {
    const settings = loadSettings();
    const tracking: TrackingConfig = {
      face: trackingMapRef.current,
      platformFace: platformFaceMapRef.current,
      hand: handTrackingMapRef.current,
      pose: poseTrackingMapRef.current,
      calibration: viewerController.exportCalibrationConfig(),
    };
    downloadConfig(settings, tracking);
  }, [
    handTrackingMapRef,
    platformFaceMapRef,
    trackingMapRef,
    poseTrackingMapRef,
    viewerController,
  ]);

  const handleImportConfig = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const config = importConfig(text);
      if (config) {
        updateSettings(config.settings);
        setBgMode(config.settings.bgMode);
        setSmoothing(config.settings.smoothing);
        setAlwaysOnTop(config.settings.alwaysOnTop);
        setLipSyncMode(config.settings.lipSyncMode);
        setRecordingFormat(config.settings.recordingFormat);
        setColliderEffects(config.settings.colliderEffects);
        if (config.tracking?.face) trackingMapRef.current = config.tracking.face;
        if (config.tracking?.platformFace) {
          platformFaceMapRef.current = config.tracking.platformFace;
        }
        if (config.tracking?.hand) handTrackingMapRef.current = config.tracking.hand;
        if (config.tracking?.pose) poseTrackingMapRef.current = config.tracking.pose;
        if (config.tracking?.calibration) {
          await viewerController.dispatch({
            type: "calibration.importConfig",
            config: config.tracking.calibration,
            scopes: ["write:calibration"],
          });
          setCalibrationSnapshot(viewerController.snapshot().calibration);
        }
        showToast(t("importSuccess"));
      } else {
        setError(t("importFailed"));
      }
    };
    input.click();
  }, [
    t,
    showToast,
    setError,
    setSmoothing,
    handTrackingMapRef,
    setBgMode,
    trackingMapRef,
    setRecordingFormat,
    poseTrackingMapRef,
    setLipSyncMode,
    setAlwaysOnTop,
    setColliderEffects,
    platformFaceMapRef,
    viewerController,
  ]);

  useViewerApiRendererBridge(viewerController);

  useEffect(() => {
    if (!panelOpen) return;
    const id = window.setInterval(() => {
      setCalibrationSnapshot(viewerController.snapshot().calibration);
    }, 250);
    return () => window.clearInterval(id);
  }, [panelOpen, viewerController]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "v") return;
      event.preventDefault();
      setPanelOpen((open) => !open);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [setPanelOpen]);

  const handleSaveThumbnail = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = generateThumbnail(canvasRef.current, {
      width: 512,
      height: 512,
      format: "png",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${modelName || "vivi"}-thumb.png`;
    a.click();
  }, [modelName]);

  useViewerLoop({
    loaded,
    lipSync,
    lipSyncMode,
    setCurrentVowel,
    setHudStats,
    modelRef,
    rendererRef,
    particlesRef,
    applyParameters: applyLipSyncParameters,
    calibrationProcessorRef,
    smoothingRef,
    lipSyncVolumeRef,
    lipSyncVowelRef,
    trackingMapRef,
    showHudRef,
  });

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const model = modelRef.current;
      const renderer = rendererRef.current;
      if (!model || !renderer) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = e.currentTarget.width / rect.width;
      const scaleY = e.currentTarget.height / rect.height;
      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      const world = renderer.screenToWorld(screenX, screenY);
      const hit = model.hitTest(world.x, world.y);

      if (hit) {
        showHit(`${hit.colliderName}${hit.tag ? ` [${hit.tag}]` : ""}`);

        if (colliderEffects) {
          const tag = (hit.tag ?? "").toLowerCase();
          const effectType = (COLLIDER_EFFECT_MAP[tag] ??
            COLLIDER_EFFECT_MAP.default ??
            "confetti") as ParticleEffectType;
          particlesRef.current?.play(effectType, {
            x: screenX,
            y: screenY,
          });
        }
      }
    },
    [
      colliderEffects,
      showHit,
      rendererRef,
      particlesRef,
      modelRef,
    ],
  );

  const activePreset = useExpressionPresetHotkeys(loaded, modelRef, runTrustedAction);
  const viewerIssues = createViewerIssueFromMessage(error, 0);
  const calibrationNeedsAttention =
    loaded &&
    calibrationSnapshot.diagnostics.some(
      (diagnostic) => diagnostic.clipped === true || diagnostic.stale === true,
    );
  const workflow = deriveViewerWorkflowModel({
    loaded,
    modelLoading,
    recordingState,
    viewerApiEnabled: viewerApiStatus.enabled === true,
    calibrationNeedsAttention,
    suppressedRecommendations,
    issues: viewerIssues,
  });
  const handleOpenSheetSection = useCallback(
    (section: ViewerSheetSection) => {
      setActiveSheetSection(section);
      setPanelOpen(true);
    },
    [setPanelOpen],
  );
  const handleTogglePanel = useCallback(() => {
    setPanelOpen((open) => !open);
  }, [setPanelOpen]);
  const persistSuppressedRecommendations = useCallback(
    (next: Partial<Record<ViewerRecommendationKey, number>>) => {
      setSuppressedRecommendations(next);
      updateSettings({ recommendationSuppressions: next });
    },
    [],
  );
  const dismissRecommendation = useCallback(
    (key: ViewerRecommendationKey) => {
      const next = { ...suppressedRecommendations, [key]: Date.now() };
      persistSuppressedRecommendations(next);
      setReadinessWarnings((warnings) =>
        warnings.map((warning) =>
          warning.recommendationKey === key
            ? { ...warning, dismissed: true }
            : warning,
        ),
      );
    },
    [persistSuppressedRecommendations, suppressedRecommendations],
  );
  const restoreRecommendation = useCallback(
    (key: ViewerRecommendationKey) => {
      const next = { ...suppressedRecommendations };
      delete next[key];
      persistSuppressedRecommendations(next);
      setReadinessWarnings((warnings) =>
        warnings.map((warning) =>
          warning.recommendationKey === key
            ? { ...warning, dismissed: false }
            : warning,
        ),
      );
    },
    [persistSuppressedRecommendations, suppressedRecommendations],
  );
  const runGoLiveCheck = useCallback(() => {
    const warnings: ReadinessWarning[] = [];
    if (calibrationNeedsAttention) {
      warnings.push({
        id: "calibration",
        label: t("calibrationReviewWarning"),
        targetSection: "calibration",
        recommendationKey: "calibrate",
        dismissed: suppressedRecommendations.calibrate !== undefined,
      });
    }
    if (!viewerApiStatus.enabled) {
      warnings.push({
        id: "connect",
        label: t("localApiOptionalWarning"),
        targetSection: "connect",
        recommendationKey: "connect",
        dismissed: suppressedRecommendations.connect !== undefined,
      });
    }
    const hiddenProps = viewerProps.filter((prop) => !prop.visible).length;
    if (hiddenProps > 0) {
      warnings.push({
        id: "hidden-props",
        label: t("hiddenItemsWarning").replace("{count}", String(hiddenProps)),
        targetSection: "overlays",
      });
    }
    setReadinessWarnings(warnings);
    if (warnings.length === 0) {
      showToast(t("readyToStream"));
    }
  }, [
    calibrationNeedsAttention,
    locale,
    showToast,
    suppressedRecommendations,
    viewerApiStatus.enabled,
    viewerProps,
  ]);
  const handleWorkflowPrimaryAction = useCallback(() => {
    if (workflow.step === "prepare") {
      runGoLiveCheck();
      return;
    }
    if (workflow.step === "error") {
      setPanelOpen(true);
      return;
    }
    if (workflow.step === "connect" || workflow.step === "calibrate") {
      handleOpenSheetSection(workflow.targetSection);
    }
  }, [handleOpenSheetSection, runGoLiveCheck, setPanelOpen, workflow]);

  useEffect(() => {
    if (!loaded || !modelName) return;
    const next = resetSuppressionsOnEvent(suppressedRecommendations, {
      type: "modelLoaded",
    });
    if (next.calibrate !== suppressedRecommendations.calibrate) {
      persistSuppressedRecommendations(next);
    }
  }, [
    loaded,
    modelName,
    persistSuppressedRecommendations,
    suppressedRecommendations,
  ]);

  useEffect(() => {
    if (!viewerApiStatus.enabled) return;
    const next = resetSuppressionsOnEvent(suppressedRecommendations, {
      type: "localApiEnabled",
    });
    if (next.connect !== suppressedRecommendations.connect) {
      persistSuppressedRecommendations(next);
    }
  }, [
    persistSuppressedRecommendations,
    suppressedRecommendations,
    viewerApiStatus.enabled,
  ]);
  const sideSheetSections = createViewerSideSheetSections({
    session: {
      t,
      loaded,
      bgMode,
      smoothing,
      alwaysOnTop,
      showHud,
      locale,
      recordingFormat,
      recordingState,
      recordingElapsed,
      onBgModeChange: (mode) => {
        setBgMode(mode);
        updateSettings({ bgMode: mode });
        window.viviAPI?.setBackgroundMode(mode);
      },
      onSmoothingChange: (v) => {
        setSmoothing(v);
        updateSettings({ smoothing: v });
      },
      onToggleAlwaysOnTop: async () => {
        if (window.viviAPI) {
          const r = await window.viviAPI.toggleAlwaysOnTop();
          setAlwaysOnTop(r);
          updateSettings({ alwaysOnTop: r });
        }
      },
      onToggleHud: () => setShowHud((v) => !v),
      onSetLocale: setLocale,
      onUrlLoad: handleUrlLoad,
      onRecordingFormatChange: (f) => {
        setRecordingFormat(f);
        updateSettings({ recordingFormat: f });
      },
      onToggleRecording: toggleRecording,
      onSaveThumbnail: handleSaveThumbnail,
      onExportConfig: handleExportConfig,
      onImportConfig: handleImportConfig,
    },
    connect: { locale },
    overlays: {
      locale,
      props: viewerProps,
      apiGrants: viewerApiStatus.grants ?? [],
      error: overlayActions.error,
      onAddFile: overlayActions.handleAddFile,
      onCreateApiAsset: overlayActions.handleCreateApiAsset,
      onListApiAssets: overlayActions.handleListApiAssets,
      onExtendApiAsset: overlayActions.handleExtendApiAsset,
      onRevokeApiAsset: overlayActions.handleRevokeApiAsset,
      onDuplicateProp: overlayActions.handleDuplicateProp,
      onRemoveProp: overlayActions.handleRemoveProp,
      onPatchTransform: overlayActions.handlePatchTransform,
      onSetVisible: overlayActions.handleSetVisible,
      onUpdateProp: overlayActions.handleUpdateProp,
      onCycleGroup: overlayActions.handleCycleGroup,
      onSpawnBurst: overlayActions.handleSpawnBurst,
    },
    calibration: {
      locale,
      snapshot: calibrationSnapshot,
      onApplyProfile: (profileId) => {
        void viewerController.dispatch({
          type: "calibration.applyProfile",
          profileId,
          scopes: ["write:calibration"],
        });
      },
      onCaptureNeutral: (source) => {
        void viewerController.dispatch({
          type: "calibration.captureNeutral",
          source,
          scopes: ["write:calibration"],
        });
      },
      onSuggestRanges: (source) => {
        void viewerController.dispatch({
          type: "calibration.suggestRanges",
          source,
          scopes: ["write:calibration"],
        });
      },
      onReset: () => {
        void viewerController.dispatch({
          type: "calibration.reset",
          scopes: ["write:calibration"],
        });
      },
    },
    inputEffects: {
      t,
      loaded,
      locale,
      tracking,
      handTracking,
      lipSync,
      poseTracking,
      lipSyncMode,
      cameras,
      selectedCamera,
      colliderEffects,
      gamepadActive,
      midiActive,
      scriptInput,
      scriptRunning,
      onToggleTracking: toggleTracking,
      onToggleHandTracking: toggleHandTracking,
      onToggleLipSync: toggleLipSync,
      onTogglePoseTracking: togglePoseTracking,
      onCameraChange: (deviceId) => {
        setSelectedCamera(deviceId);
        updateSettings({ cameraDeviceId: deviceId });
      },
      onLipSyncModeChange: (mode) => {
        setLipSyncMode(mode);
        updateSettings({ lipSyncMode: mode });
      },
      onToggleColliderEffects: () => {
        const n = !colliderEffects;
        setColliderEffects(n);
        updateSettings({ colliderEffects: n });
      },
      onPlayEffect: playEffect,
      onToggleGamepad: toggleGamepad,
      onToggleMidi: toggleMidi,
      onScriptInputChange: setScriptInput,
      onRunScript: handleRunScript,
    },
  });

  return (
    <ViewerShellFrame
      rootAriaLabel={t("viewerAriaLabel")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      toolbarProps={{
        t,
        locale,
        loaded,
        modelName,
        mappedCount,
        platformFaceMappedCount,
        handMappedCount,
        poseMappedCount,
        tracking,
        handTracking,
        lipSync,
        poseTracking,
        error,
        panelOpen,
        recordingState,
        recordingElapsed,
        workflow,
        onFileLoad: handleFileLoad,
        onTogglePanel: handleTogglePanel,
        onPrimaryAction: handleWorkflowPrimaryAction,
        onToggleRecording: toggleRecording,
        onToggleHud: () => setShowHud((v) => !v),
      }}
      sideSheetProps={{
        locale,
        open: panelOpen,
        activeSection: activeSheetSection,
        issues: viewerIssues,
        sections: sideSheetSections,
        onClose: () => setPanelOpen(false),
        onSectionChange: setActiveSheetSection,
      }}
      statusStripProps={{
        locale,
        loaded,
        modelName,
        viewerApiEnabled: viewerApiStatus.enabled === true,
        tracking,
        handTracking,
        poseTracking,
        lipSync,
        showHud,
        recordingState,
        propCount: viewerProps.length,
        calibrationProfileCount: calibrationSnapshot.profiles.length,
      }}
    >
      <ViewerStage
        t={t}
        locale={locale}
        loaded={loaded}
        dragging={dragging}
        bgMode={bgMode}
        canvasRef={canvasRef}
        onCanvasClick={handleCanvasClick}
        readinessWarnings={readinessWarnings}
        onClearReadinessWarnings={() => setReadinessWarnings([])}
        onOpenSheetSection={handleOpenSheetSection}
        onDismissRecommendation={dismissRecommendation}
        onRestoreRecommendation={restoreRecommendation}
        lastHit={lastHit}
        showHud={showHud}
        hudStats={hudStats}
        viewerProps={viewerProps}
        lipSync={lipSync}
        lipSyncMode={lipSyncMode}
        currentVowel={currentVowel}
        recordingState={recordingState}
        activePreset={activePreset}
        toast={toast}
      />
    </ViewerShellFrame>
  );
}
