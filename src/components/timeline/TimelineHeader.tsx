import { findClipInProject } from "@vivi2d/core/scene-utils";
import { formatFrameTime } from "@vivi2d/core/timeline-utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTimelineSync } from "@/hooks/useTimelineSync";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { AnimationRetargetDialog } from "./AnimationRetargetDialog";
import { FirstMotionDialog } from "./FirstMotionDialog";
import { IdleSynthDialog } from "./IdleSynthDialog";
import { MotionAssistDialog } from "./MotionAssistDialog";
import { MotionPresetDialog } from "./MotionPresetDialog";
import { SceneSelector } from "./SceneSelector";

export function TimelineHeader() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const activeClipId = useTimelineStore((s) => s.activeClipId);
  const activeSceneId = useTimelineStore((s) => s.activeSceneId);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const isLooping = useTimelineStore((s) => s.isLooping);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const viewMode = useTimelineStore((s) => s.viewMode);
  const registerQuickAction = useQuickActionRegistryStore((s) => s.registerAction);
  const unregisterQuickAction = useQuickActionRegistryStore((s) => s.unregisterAction);
  const { syncParametersAtFrame } = useTimelineSync();
  const [showMotionPresetDialog, setShowMotionPresetDialog] = useState(false);
  const [showIdleSynthDialog, setShowIdleSynthDialog] = useState(false);
  const [showMotionAssistDialog, setShowMotionAssistDialog] = useState(false);
  const [showRetargetDialog, setShowRetargetDialog] = useState(false);
  const [showFirstMotionDialog, setShowFirstMotionDialog] = useState(false);

  const clips = useMemo(
    () =>
      project?.scenes.find((scene) => scene.id === activeSceneId)?.clips ??
      project?.clips ??
      [],
    [project, activeSceneId],
  );

  const clip = useMemo(
    () => clips.find((entry) => entry.id === activeClipId),
    [clips, activeClipId],
  );

  useEffect(() => {
    if (!activeClipId || clip) return;
    useTimelineStore.getState().setActiveClip(null);
  }, [activeClipId, clip]);

  useEffect(() => {
    registerQuickAction({
      id: "timeline.firstMotion",
      section: "timeline",
      title: t("timeline.firstMotionButtonLabel"),
      description: t("timeline.firstMotionButtonTitle"),
      keywords: ["first", "motion", "blink", "breathing", "idle"],
      order: 10,
      run: () => setShowFirstMotionDialog(true),
      getAvailability: () =>
        project
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresProject") },
    });
    registerQuickAction({
      id: "timeline.motionPreset",
      section: "timeline",
      title: t("timeline.motionPresetButtonLabel"),
      description: t("timeline.motionPresetButtonTitle"),
      keywords: ["motion", "preset", "blink", "breathing", "sway"],
      order: 20,
      run: () => setShowMotionPresetDialog(true),
      getAvailability: () =>
        clip
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresClip") },
    });
    registerQuickAction({
      id: "timeline.idleSynth",
      section: "timeline",
      title: t("timeline.idleSynthButtonLabel"),
      description: t("timeline.idleSynthButtonTitle"),
      keywords: ["idle", "synth", "blink", "breathing"],
      order: 30,
      run: () => setShowIdleSynthDialog(true),
      getAvailability: () =>
        clip
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresClip") },
    });
    registerQuickAction({
      id: "timeline.motionAssist",
      section: "timeline",
      title: t("timeline.motionAssistButtonLabel"),
      description: t("timeline.motionAssistButtonTitle"),
      keywords: ["motion", "assist", "import", "sample"],
      order: 40,
      run: () => setShowMotionAssistDialog(true),
      getAvailability: () =>
        clip
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresClip") },
    });
    registerQuickAction({
      id: "timeline.animationRetarget",
      section: "timeline",
      title: t("timeline.retargetButtonLabel"),
      description: t("timeline.retargetButtonTitle"),
      keywords: ["retarget", "animation", "clip"],
      order: 50,
      run: () => setShowRetargetDialog(true),
      getAvailability: () =>
        clip
          ? { enabled: true }
          : { enabled: false, reason: t("quickActions.requiresClip") },
    });
    return () => {
      unregisterQuickAction("timeline.firstMotion");
      unregisterQuickAction("timeline.motionPreset");
      unregisterQuickAction("timeline.idleSynth");
      unregisterQuickAction("timeline.motionAssist");
      unregisterQuickAction("timeline.animationRetarget");
    };
  }, [clip, project, registerQuickAction, t, unregisterQuickAction]);

  const handleCreateClip = useCallback(() => {
    const name = `Clip ${clips.length + 1}`;
    const clipId = useClipStore.getState().createClip(name);
    useTimelineStore.getState().setActiveClip(clipId);
  }, [clips.length]);

  const handleDeleteClip = useCallback(() => {
    if (!activeClipId) return;
    useClipStore.getState().deleteClip(activeClipId);
    useTimelineStore.getState().setActiveClip(null);
  }, [activeClipId]);

  const handleClipChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const clipId = event.target.value || null;
      useTimelineStore.getState().setActiveClip(clipId);
      if (clipId) {
        const nextProject = useEditorStore.getState().project;
        const nextClip = nextProject ? findClipInProject(nextProject, clipId) : undefined;
        syncParametersAtFrame(nextClip, 0);
      }
    },
    [syncParametersAtFrame],
  );

  const toggleViewMode = useCallback(() => {
    const next = viewMode === "dopeSheet" ? "graphEditor" : "dopeSheet";
    useTimelineStore.getState().setViewMode(next);
  }, [viewMode]);

  return (
    <div className="timeline-header">
      <SceneSelector />
      <div className="timeline-controls">
        <button
          type="button"
          className="tl-btn"
          onClick={() => useTimelineStore.getState().stop()}
          title={t("timeline.stopTitle")}
          disabled={!clip}
        >
          {t("timeline.stopButton")}
        </button>
        <button
          type="button"
          className={`tl-btn ${isPlaying ? "active" : ""}`}
          onClick={() => useTimelineStore.getState().togglePlay()}
          title={isPlaying ? t("timeline.pauseTitle") : t("timeline.playTitle")}
          disabled={!clip}
        >
          {isPlaying ? t("timeline.pauseButton") : t("timeline.playButton")}
        </button>
        <button
          type="button"
          className={`tl-btn ${isLooping ? "active" : ""}`}
          onClick={() => useTimelineStore.getState().setLooping(!isLooping)}
          title={t("timeline.loopTitle")}
          disabled={!clip}
        >
          {t("timeline.loopButton")}
        </button>
        <span className="tl-frame-display">
          {clip ? formatFrameTime(currentFrame, clip.fps) : "--:--:--"}
        </span>
        <span className="tl-frame-number">
          {clip ? `${currentFrame} / ${clip.duration - 1}` : ""}
        </span>
        <button
          type="button"
          className={`tl-btn ${viewMode === "dopeSheet" ? "active" : ""}`}
          onClick={toggleViewMode}
          title={
            viewMode === "dopeSheet"
              ? t("timeline.switchToGraphEditor")
              : t("timeline.switchToDopeSheet")
          }
          disabled={!clip}
        >
          {viewMode === "dopeSheet" ? t("timeline.graphButton") : t("timeline.dopeButton")}
        </button>
      </div>
      <div className="timeline-clip-selector">
        <select
          value={activeClipId ?? ""}
          onChange={handleClipChange}
          className="tl-clip-select"
          aria-label={t("timeline.clipSelectLabel")}
        >
          <option value="">{t("timeline.clipNone")}</option>
          {clips.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="tl-btn"
          onClick={() => setShowFirstMotionDialog(true)}
          title={t("timeline.firstMotionButtonTitle")}
          disabled={!project}
        >
          {t("timeline.firstMotionButtonLabel")}
        </button>
        <button
          type="button"
          className="tl-btn"
          onClick={() => setShowMotionPresetDialog(true)}
          title={t("timeline.motionPresetButtonTitle")}
          disabled={!clip}
        >
          {t("timeline.motionPresetButtonLabel")}
        </button>
        <button
          type="button"
          className="tl-btn"
          onClick={() => setShowIdleSynthDialog(true)}
          title={t("timeline.idleSynthButtonTitle")}
          disabled={!clip}
        >
          {t("timeline.idleSynthButtonLabel")}
        </button>
        <button
          type="button"
          className="tl-btn"
          onClick={() => setShowMotionAssistDialog(true)}
          title={t("timeline.motionAssistButtonTitle")}
          disabled={!clip}
        >
          {t("timeline.motionAssistButtonLabel")}
        </button>
        <button
          type="button"
          className="tl-btn"
          onClick={() => setShowRetargetDialog(true)}
          title={t("timeline.retargetButtonTitle")}
          disabled={!clip}
        >
          {t("timeline.retargetButtonLabel")}
        </button>
        <button
          type="button"
          className="tl-btn"
          onClick={handleCreateClip}
          title={t("timeline.newClipTitle")}
        >
          +
        </button>
        {activeClipId && (
          <button
            type="button"
            className="tl-btn tl-btn-danger"
            onClick={handleDeleteClip}
            title={t("timeline.deleteClipTitle")}
          >
            {t("timeline.deleteButton")}
          </button>
        )}
      </div>
      {project && clip && showMotionPresetDialog && (
        <MotionPresetDialog
          project={project}
          clip={clip}
          currentFrame={currentFrame}
          onClose={() => setShowMotionPresetDialog(false)}
        />
      )}
      {project && clip && showIdleSynthDialog && (
        <IdleSynthDialog
          project={project}
          clip={clip}
          currentFrame={currentFrame}
          onClose={() => setShowIdleSynthDialog(false)}
        />
      )}
      {project && clip && showMotionAssistDialog && (
        <MotionAssistDialog
          project={project}
          clip={clip}
          currentFrame={currentFrame}
          onClose={() => setShowMotionAssistDialog(false)}
        />
      )}
      {project && clip && showRetargetDialog && (
        <AnimationRetargetDialog
          project={project}
          targetClip={clip}
          currentFrame={currentFrame}
          onClose={() => setShowRetargetDialog(false)}
        />
      )}
      {project && showFirstMotionDialog && (
        <FirstMotionDialog
          project={project}
          activeClip={clip ?? null}
          onClose={() => setShowFirstMotionDialog(false)}
        />
      )}
    </div>
  );
}
