import { decodeVivid, encodeVivid } from "@vivi2d/core/vivid-format";
import { t as tGlobal } from "@/lib/i18n";
import { inferProjectSourceKind } from "@/lib/project-source-kind";
import { clearTextures, getAllTextures } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { useNotificationStore } from "../notificationStore";
import { initParameterValues, resetRelatedStores } from "./reset";

export async function exportVividProject(password: string): Promise<boolean> {
  const { project } = useEditorStore.getState();
  if (!project) return false;
  if (!password) {
    useNotificationStore.getState().addNotification("error", tGlobal("notify.passwordEmpty"));
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
  if (!password) {
    useNotificationStore.getState().addNotification("error", tGlobal("notify.passwordEmpty"));
    return false;
  }

  try {
    const result = await window.electronAPI.openVividFile();
    if (!result) return false;

    const viviJson = await decodeVivid(result.binary, password);
    const { parseViviFile, deserializeProject } = await import(
      "@/lib/project-serializer"
    );
    const fileData = parseViviFile(viviJson);
    clearTextures();
    const project = await deserializeProject(fileData);
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
