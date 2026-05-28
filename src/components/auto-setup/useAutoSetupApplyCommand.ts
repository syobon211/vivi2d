import { useCallback, useRef, useState, type RefObject } from "react";
import type { AutoSetupResult } from "@/lib/auto-setup";
import type { I18nKey } from "@/lib/i18n";
import { applyAutoSetupResult } from "@/stores/autoSetupApplyWorkflow";
import { useNotificationStore } from "@/stores/notificationStore";

interface UseAutoSetupApplyCommandOptions {
  result: AutoSetupResult | null;
  excludedIds: Set<string>;
  isMountedRef: RefObject<boolean>;
  clearDraft: () => void;
  onClose: () => void;
  onBeforeSuccessClose?: () => void;
  t: (key: I18nKey) => string;
}

export function useAutoSetupApplyCommand({
  result,
  excludedIds,
  isMountedRef,
  clearDraft,
  onClose,
  onBeforeSuccessClose,
  t,
}: UseAutoSetupApplyCommandOptions) {
  const [applying, setApplying] = useState(false);
  const applyInFlightRef = useRef(false);

  const resetApplyState = useCallback(() => {
    applyInFlightRef.current = false;
    setApplying(false);
  }, []);

  const handleApply = useCallback(async () => {
    if (!result) return;
    if (applyInFlightRef.current) return;
    applyInFlightRef.current = true;
    setApplying(true);

    try {
      const applyResult = await applyAutoSetupResult({ result, excludedIds });
      if (!isMountedRef.current) return;
      if (applyResult.status === "noProject") return;
      if (applyResult.status === "unsupportedHost") {
        useNotificationStore
          .getState()
          .addNotification("error", t("autoSetup.unsupportedHost"));
        return;
      }
      if (applyResult.status === "planUnsupported") {
        useNotificationStore
          .getState()
          .addNotification("error", t("autoSetup.planUnsupported"));
        return;
      }
      if (applyResult.status === "applyFailed") {
        useNotificationStore
          .getState()
          .addNotification("error", t("autoSetup.applyFailed"));
        return;
      }

      if (applyResult.skippedRiskyWeightLayerIds.length > 0) {
        useNotificationStore
          .getState()
          .addNotification("warning", t("autoSetup.skippedRiskyWeights"));
      }
      if (applyResult.skippedManagedObjects.length > 0) {
        useNotificationStore
          .getState()
          .addNotification("warning", t("autoSetup.skippedManagedObjects"));
      }
      onBeforeSuccessClose?.();
      clearDraft();
      onClose();
    } catch (err) {
      console.error(err);
      useNotificationStore
        .getState()
        .addNotification("error", t("autoSetup.applyFailed"));
    } finally {
      applyInFlightRef.current = false;
      if (isMountedRef.current) {
        setApplying(false);
      }
    }
  }, [clearDraft, result, excludedIds, isMountedRef, onBeforeSuccessClose, onClose, t]);

  return {
    applying,
    handleApply,
    resetApplyState,
  };
}
