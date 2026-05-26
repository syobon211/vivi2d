import type { ViviFileData } from "@vivi2d/core/types";
import { assertPublicViviFileProfile } from "@vivi2d/core/public-profile";
import { decodeViviBinary, encodeViviBinary } from "@vivi2d/core/vivib-format";
import { t as tGlobal } from "@/lib/i18n";
import { inferProjectSourceKind } from "@/lib/project-source-kind";
import { clearTextures, getAllTextures } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { useNotificationStore } from "../notificationStore";
import { initParameterValues, resetRelatedStores } from "./reset";

export async function loadProject(): Promise<boolean> {
  try {
    const result = await window.electronAPI.openViviFile();
    if (!result) return false;

    const { parseViviFile, deserializeProject } = await import(
      "@/lib/project-serializer"
    );

    const fileData: ViviFileData =
      "binary" in result ? decodeViviBinary(result.binary) : parseViviFile(result.data);
    assertPublicViviFileProfile(fileData);
    clearTextures();
    const project = await deserializeProject(fileData);
    const inferredSourceKind = inferProjectSourceKind(project);
    project.sourceKind = inferredSourceKind === "none" ? undefined : inferredSourceKind;

    useEditorStore.setState((s) => {
      s.project = project;
      s.projectVersion += 1;
      s.currentFilePath = result.filePath;
      s.projectSourceKind = inferredSourceKind;
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
          ? `${tGlobal("notify.projectLoadFailed")}: ${e.message}`
          : tGlobal("notify.projectLoadFailed"),
      );
    return false;
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const { project, currentFilePath } = useEditorStore.getState();
  if (!project) return false;

  try {
    const textures = getAllTextures();
    const { serializeProject } = await import("@/lib/project-serializer");
    const fileData = serializeProject(project, textures);

    const targetPath = saveAs ? undefined : (currentFilePath ?? undefined);
    const isBinary = targetPath?.endsWith(".vivb");
    const defaultName = `${project.name}${isBinary ? ".vivb" : ".vivi"}`;

    const result = await window.electronAPI.saveFile({
      data: JSON.stringify(fileData),
      binary: encodeViviBinary(fileData).buffer as ArrayBuffer,
      defaultName,
      filePath: targetPath,
    });
    if (!result) return false;

    useEditorStore.setState((s) => {
      s.currentFilePath = result.filePath;
    });
    return true;
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        e instanceof Error
          ? `${tGlobal("notify.projectSaveFailed")}: ${e.message}`
          : tGlobal("notify.projectSaveFailed"),
      );
    return false;
  }
}
