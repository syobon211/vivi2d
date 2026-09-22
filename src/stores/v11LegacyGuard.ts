import { t } from "@/lib/i18n";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import { useEditorStore } from "./editorStore";
import { useNotificationStore } from "./notificationStore";

/** Before legacy decoders, texture installers or provenance writes, not UI-only. */
export function rejectV11LegacyAction(): boolean {
  if (!useEditorStore.getState().projectV11 && !isProjectV11Publishing()) return false;
  try {
    useNotificationStore
      .getState()
      .addNotification("warning", t("v11.legacyUnavailable"));
  } catch {
    /* No core mutation has occurred. */
  }
  return true;
}
