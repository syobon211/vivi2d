import { useEffect, useRef } from "react";
import { t as translateI18n } from "@/lib/i18n";
import {
  type AutoSetupQuickCommand,
  type AutoSetupQuickCommandKind,
} from "@/stores/autoSetupCommandStore";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";

type QuickActionHandler = () => Promise<void> | void;

export type AutoSetupQuickActionHandlers = Record<
  AutoSetupQuickCommandKind,
  QuickActionHandler
>;

interface UseAutoSetupQuickActionsOptions {
  isSeeThroughProject: boolean;
  locale: string;
  draftProjectKey: string | null;
  projectStructureVersion: number;
  pendingQuickCommand: AutoSetupQuickCommand | null;
  consumeCompatibleQuickCommand: (
    projectKey: string,
    projectStructureVersion: number,
  ) => AutoSetupQuickCommand | null;
  setQuickCommandInFlight: (inFlight: boolean) => void;
  handlers: AutoSetupQuickActionHandlers;
}

export function useAutoSetupQuickActions({
  isSeeThroughProject,
  locale,
  draftProjectKey,
  projectStructureVersion,
  pendingQuickCommand,
  consumeCompatibleQuickCommand,
  setQuickCommandInFlight,
  handlers,
}: UseAutoSetupQuickActionsOptions): void {
  const handlersRef = useRef<AutoSetupQuickActionHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isSeeThroughProject) return;
    const quickActions = useQuickActionRegistryStore.getState();
    const getProjectAvailability = () =>
      useEditorStore.getState().project
        ? { enabled: true as const }
        : {
            enabled: false as const,
            reason: translateI18n("quickActions.requiresProject"),
          };

    quickActions.registerAction({
      id: "autoSetup.readyToRig",
      section: "project",
      title: translateI18n("quickActions.action.readyToRig.title"),
      description: translateI18n("quickActions.action.readyToRig.description"),
      keywords: ["auto", "setup", "see-through", "ready", "cleanup", "rig"],
      order: 30,
      run: () => {
        void handlersRef.current.readyToRig();
      },
      getAvailability: getProjectAvailability,
    });
    quickActions.registerAction({
      id: "autoSetup.meshRefine",
      section: "project",
      title: translateI18n("quickActions.action.refineImportedMeshes.title"),
      description: translateI18n(
        "quickActions.action.refineImportedMeshes.description",
      ),
      keywords: ["auto", "setup", "mesh", "refine", "see-through"],
      order: 35,
      run: () => {
        void handlersRef.current.meshRefine();
      },
      getAvailability: getProjectAvailability,
    });
    quickActions.registerAction({
      id: "autoSetup.eyeClipping",
      section: "project",
      title: translateI18n(
        "quickActions.action.applyAutomaticEyeClipping.title",
      ),
      description: translateI18n(
        "quickActions.action.applyAutomaticEyeClipping.description",
      ),
      keywords: ["auto", "setup", "eye", "clipping", "see-through"],
      order: 40,
      run: () => {
        void handlersRef.current.eyeClipping();
      },
      getAvailability: getProjectAvailability,
    });
    quickActions.registerAction({
      id: "autoSetup.eyeRig",
      section: "project",
      title: translateI18n("quickActions.action.createBasicEyeRig.title"),
      description: translateI18n(
        "quickActions.action.createBasicEyeRig.description",
      ),
      keywords: ["auto", "setup", "eye", "rig", "blink", "see-through"],
      order: 50,
      run: () => {
        void handlersRef.current.eyeRig();
      },
      getAvailability: getProjectAvailability,
    });
    quickActions.registerAction({
      id: "autoSetup.leftRightRepair",
      section: "project",
      title: translateI18n("quickActions.action.repairLeftRightRoles.title"),
      description: translateI18n(
        "quickActions.action.repairLeftRightRoles.description",
      ),
      keywords: ["auto", "setup", "left", "right", "roles", "see-through"],
      order: 60,
      run: () => {
        void handlersRef.current.leftRightRepair();
      },
      getAvailability: getProjectAvailability,
    });
    quickActions.registerAction({
      id: "autoSetup.mouthRig",
      section: "project",
      title: translateI18n("quickActions.action.createBasicMouthRig.title"),
      description: translateI18n(
        "quickActions.action.createBasicMouthRig.description",
      ),
      keywords: ["auto", "setup", "mouth", "rig", "lipsync", "see-through"],
      order: 70,
      run: () => {
        void handlersRef.current.mouthRig();
      },
      getAvailability: getProjectAvailability,
    });
    return () => {
      const { unregisterAction } = useQuickActionRegistryStore.getState();
      unregisterAction("autoSetup.readyToRig");
      unregisterAction("autoSetup.meshRefine");
      unregisterAction("autoSetup.eyeClipping");
      unregisterAction("autoSetup.eyeRig");
      unregisterAction("autoSetup.leftRightRepair");
      unregisterAction("autoSetup.mouthRig");
    };
  }, [isSeeThroughProject, locale]);

  useEffect(() => {
    if (!pendingQuickCommand || !draftProjectKey) return;
    const command = consumeCompatibleQuickCommand(
      draftProjectKey,
      projectStructureVersion,
    );
    if (!command || !isSeeThroughProject) return;

    void (async () => {
      setQuickCommandInFlight(true);
      try {
        await handlersRef.current[command.kind]();
      } finally {
        setQuickCommandInFlight(false);
      }
    })();
  }, [
    consumeCompatibleQuickCommand,
    draftProjectKey,
    isSeeThroughProject,
    pendingQuickCommand,
    projectStructureVersion,
    setQuickCommandInFlight,
  ]);
}
