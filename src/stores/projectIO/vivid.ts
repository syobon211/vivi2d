import { decodeVivid, encodeVivid } from "@vivi2d/core/vivid-format";
import { t as tGlobal } from "@/lib/i18n";
import { inferProjectSourceKind } from "@/lib/project-source-kind";
import { clearTextures, getAllTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { useNotificationStore } from "../notificationStore";
import { rejectV11LegacyAction } from "../v11LegacyGuard";
import { initParameterValues, resetRelatedStores } from "./reset";

export async function exportVividProject(password: string): Promise<boolean> {
  if (rejectV11LegacyAction()) return false;
  const { project } = useEditorStore.getState();
  if (!project) return false;
  if (!password) {
    useNotificationStore
      .getState()
      .addNotification("error", tGlobal("notify.passwordEmpty"));
    return false;
  }

  try {
    const textures = getAllTextures();
    const { serializeProject } = await import("@/lib/project-serializer");
    const fileData = serializeProject(project, textures);
    const viviJson = JSON.stringify(fileData);
    const binary = await encodeVivid(viviJson, password);

    const result = await window.electronAPI.saveVividFile({
      binary,
      defaultName: `${project.name}.vivid`,
    });
    if (!result) return false;

    useNotificationStore
      .getState()
      .addNotification("info", tGlobal("notify.vividExportSuccess"));
    return true;
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        e instanceof Error
          ? `${tGlobal("notify.vividExportFailed")}: ${e.message}`
          : tGlobal("notify.vividExportFailed"),
      );
    return false;
  }
}

export async function importVividProject(password: string): Promise<boolean> {
  if (rejectV11LegacyAction()) return false;
  const before = useEditorStore.getState();
  if (!password) {
    useNotificationStore
      .getState()
      .addNotification("error", tGlobal("notify.passwordEmpty"));
    return false;
  }

  try {
    const result = await window.electronAPI.openVividFile();
    if (!result) return false;

    const viviJson = await decodeVivid(result.binary, password);
    const { parseViviFile, prepareDeserializedProject } = await import(
      "@/lib/project-serializer"
    );
    const fileData = parseViviFile(viviJson);
    if (rejectV11LegacyAction()) return false;
    const prepared = await prepareDeserializedProject(fileData);
    if (
      rejectV11LegacyAction() ||
      useEditorStore.getState().projectVersion !== before.projectVersion ||
      useEditorStore.getState().project !== before.project
    )
      return false;
    const project = prepared.project;
    clearTextures();
    for (const [id, canvas] of prepared.textures) setTexture(id, canvas);
    const _inferredSourceKind = inferProjectSourceKind(project);
    project.sourceKind = "vivid";
    useEditorStore.setState((s) => {
      s.project = project;
      s.projectVersion += 1;
      s.currentFilePath = null;
      s.projectSourceKind = "vivid";
    });
    resetRelatedStores();
    initParameterValues();
    return true;
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        e instanceof Error
          ? `${tGlobal("notify.vividImportFailed")}: ${e.message}`
          : tGlobal("notify.vividImportFailed"),
      );
    return false;
  }
}
