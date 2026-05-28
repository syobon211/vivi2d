import type { Scene } from "@vivi2d/core/types";
import { useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useTimelineStore } from "@/stores/timelineStore";

const EMPTY_SCENES: readonly Scene[] = [];

export function SceneSelector() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const activeSceneId = useTimelineStore((s) => s.activeSceneId);
  const scenes = project?.scenes ?? EMPTY_SCENES;

  const handleSceneChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const sceneId = e.target.value || null;
    useTimelineStore.getState().setActiveScene(sceneId);
  }, []);

  const handleCreateScene = useCallback(() => {
    const name = `${t("timeline.sceneDefaultName")} ${scenes.length + 1}`;
    const sceneId = useSceneStore.getState().createScene(name);
    useTimelineStore.getState().setActiveScene(sceneId);
  }, [scenes.length, t]);

  const handleDeleteScene = useCallback(() => {
    if (!activeSceneId) return;
    useSceneStore.getState().deleteScene(activeSceneId);
    useTimelineStore.getState().setActiveScene(null);
  }, [activeSceneId]);

  const handleDuplicateScene = useCallback(() => {
    if (!activeSceneId) return;
    const newId = useSceneStore.getState().duplicateScene(activeSceneId);
    useTimelineStore.getState().setActiveScene(newId);
  }, [activeSceneId]);

  return (
    <div className="tl-scene-selector">
      <select
        value={activeSceneId ?? ""}
        onChange={handleSceneChange}
        className="tl-scene-select"
        title={t("timeline.selectSceneTitle")}
      >
        <option value="">{t("timeline.sceneNone")}</option>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="tl-btn"
        onClick={handleCreateScene}
        title={t("timeline.newSceneTitle")}
      >
        +
      </button>
      {activeSceneId && (
        <>
          <button
            type="button"
            className="tl-btn"
            onClick={handleDuplicateScene}
            title={t("timeline.duplicateSceneTitle")}
          >
            ⧉
          </button>
          <button
            type="button"
            className="tl-btn tl-btn-danger"
            onClick={handleDeleteScene}
            title={t("timeline.deleteSceneTitle")}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
