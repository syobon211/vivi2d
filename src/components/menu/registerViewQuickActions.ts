import type { I18nKey } from "@/lib/i18n";
import {
  hasImportedReferenceBounds,
  REFERENCE_OVERLAY_COMPARE_PRESETS,
} from "@/lib/reference-overlay-utils";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { useViewportStore } from "@/stores/viewportStore";

// biome-ignore lint/suspicious/noExplicitAny: This registry shares the legacy broad menu view-model until the menu API is split.
type MenuQuickActionsRegistrationParams = Record<string, any>;

const REFERENCE_OVERLAY_PRESET_LABEL_KEYS = {
  sourceCurrent: "prop.referenceOverlay.preset.sourceCurrent",
  sourceImported: "prop.referenceOverlay.preset.sourceImported",
  currentImported: "prop.referenceOverlay.preset.currentImported",
} as const satisfies Record<
  (typeof REFERENCE_OVERLAY_COMPARE_PRESETS)[number]["id"],
  I18nKey
>;

export function registerViewQuickActions(
  params: MenuQuickActionsRegistrationParams,
) {
  const {
    getCurrentSelectedViviMesh,
    meshHeatmap,
    meshHeatmapSelectionReason,
    project,
    qa,
    referenceOverlay,
    referenceOverlayImportedBoundsReason,
    referenceOverlaySelectionReason,
    registerQuickAction,
    requiresProjectReason,
    t,
  } = params;

  const referenceOverlayAvailability = () => {
    if (!project) {
      return { enabled: false, reason: requiresProjectReason };
    }
    if (!getCurrentSelectedViviMesh()) {
      return {
        enabled: false,
        reason: referenceOverlaySelectionReason,
      };
    }
    return { enabled: true };
  };

  registerQuickAction({
    id: "view.referenceOverlay.toggle",
    section: "view",
    title: referenceOverlay.enabled
      ? qa("action.referenceOverlayToggle.disable")
      : qa("action.referenceOverlayToggle.enable"),
    description: qa("action.referenceOverlayToggle.description"),
    keywords: ["reference", "overlay", "compare", "mesh"],
    order: 85,
    run: () => {
      const current = useViewportStore.getState().referenceOverlay;
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: !current.enabled });
    },
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.source",
    section: "view",
    title: qa("action.referenceOverlaySource.title"),
    description: qa("action.referenceOverlaySource.description"),
    keywords: ["reference", "overlay", "source", "texture"],
    order: 86,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: true, mode: "source" }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.currentBounds",
    section: "view",
    title: qa("action.referenceOverlayCurrentBounds.title"),
    description: qa("action.referenceOverlayCurrentBounds.description"),
    keywords: ["reference", "overlay", "bounds", "mesh"],
    order: 87,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({
          enabled: true,
          mode: "currentBounds",
        }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.importedBounds",
    section: "view",
    title: qa("action.referenceOverlayImportedBounds.title"),
    description: qa("action.referenceOverlayImportedBounds.description"),
    keywords: ["reference", "overlay", "imported", "see-through", "bbox"],
    order: 88,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({
          enabled: true,
          mode: "importedBounds",
        }),
    getAvailability: () => {
      const baseAvailability = referenceOverlayAvailability();
      if (!baseAvailability.enabled) return baseAvailability;
      if (!hasImportedReferenceBounds(getCurrentSelectedViviMesh())) {
        return {
          enabled: false,
          reason: referenceOverlayImportedBoundsReason,
        };
      }
      return { enabled: true };
    },
  });
  registerQuickAction({
    id: "view.referenceOverlay.compareBounds",
    section: "view",
    title: qa("action.referenceOverlayBoundsCompare.title"),
    description: qa("action.referenceOverlayBoundsCompare.description"),
    keywords: [
      "reference",
      "overlay",
      "compare",
      "bounds",
      "imported",
      "current",
    ],
    order: 89,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({
          enabled: true,
          mode: "compareBounds",
        }),
    getAvailability: () => {
      const baseAvailability = referenceOverlayAvailability();
      if (!baseAvailability.enabled) return baseAvailability;
      if (!hasImportedReferenceBounds(getCurrentSelectedViviMesh())) {
        return {
          enabled: false,
          reason: referenceOverlayImportedBoundsReason,
        };
      }
      return { enabled: true };
    },
  });
  for (const preset of REFERENCE_OVERLAY_COMPARE_PRESETS) {
    const presetLabel = t(REFERENCE_OVERLAY_PRESET_LABEL_KEYS[preset.id]);
    registerQuickAction({
      id: `view.referenceOverlay.comparePreset.${preset.id}`,
      section: "view",
      title: `${qa("action.referenceOverlayComparePrefix")} ${presetLabel}`,
      description: qa(
        "action.referenceOverlayComparePreset.description",
      ).replace("{label}", presetLabel),
      keywords: [
        "reference",
        "overlay",
        "compare",
        preset.primary,
        preset.secondary,
      ],
      order: 89,
      run: () =>
        useViewportStore.getState().setReferenceOverlaySettings({
          enabled: true,
          mode: "compareBounds",
          comparePrimary: preset.primary,
          compareSecondary: preset.secondary,
        }),
      getAvailability: () => {
        const baseAvailability = referenceOverlayAvailability();
        if (!baseAvailability.enabled) return baseAvailability;
        if (
          preset.requiresImportedBounds &&
          !hasImportedReferenceBounds(getCurrentSelectedViviMesh())
        ) {
          return {
            enabled: false,
            reason: referenceOverlayImportedBoundsReason,
          };
        }
        return { enabled: true };
      },
    });
  }
  registerQuickAction({
    id: "view.referenceOverlay.compareSwap",
    section: "view",
    title: qa("action.referenceOverlayCompareSwap.title"),
    description: qa("action.referenceOverlayCompareSwap.description"),
    keywords: ["reference", "overlay", "compare", "swap"],
    order: 89.1,
    run: () => {
      const current = useViewportStore.getState().referenceOverlay;
      useViewportStore.getState().setReferenceOverlaySettings({
        enabled: true,
        mode: "compareBounds",
        comparePrimary: current.compareSecondary ?? "importedBounds",
        compareSecondary: current.comparePrimary ?? "currentBounds",
      });
    },
    getAvailability: () => {
      const baseAvailability = referenceOverlayAvailability();
      if (!baseAvailability.enabled) return baseAvailability;
      if (
        (referenceOverlay.comparePrimary === "importedBounds" ||
          referenceOverlay.compareSecondary === "importedBounds") &&
        !hasImportedReferenceBounds(getCurrentSelectedViviMesh())
      ) {
        return {
          enabled: false,
          reason: referenceOverlayImportedBoundsReason,
        };
      }
      return { enabled: true };
    },
  });
  registerQuickAction({
    id: "view.referenceOverlay.pinCompareSummary",
    section: "view",
    title:
      referenceOverlay.pinCompareSummary === true
        ? qa("action.referenceOverlayPinCompareSummary.disable")
        : qa("action.referenceOverlayPinCompareSummary.enable"),
    description: qa("action.referenceOverlayPinCompareSummary.description"),
    keywords: ["reference", "overlay", "compare", "summary", "pin"],
    order: 89.2,
    run: () =>
      useViewportStore.getState().setReferenceOverlaySettings({
        pinCompareSummary: !(
          useViewportStore.getState().referenceOverlay.pinCompareSummary === true
        ),
      }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.opacity.25",
    section: "view",
    title: qa("action.referenceOverlayOpacity25.title"),
    description: qa("action.referenceOverlayOpacity25.description"),
    keywords: ["reference", "overlay", "opacity", "25"],
    order: 90,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: true, opacity: 0.25 }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.opacity.50",
    section: "view",
    title: qa("action.referenceOverlayOpacity50.title"),
    description: qa("action.referenceOverlayOpacity50.description"),
    keywords: ["reference", "overlay", "opacity", "50"],
    order: 91,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: true, opacity: 0.5 }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.opacity.75",
    section: "view",
    title: qa("action.referenceOverlayOpacity75.title"),
    description: qa("action.referenceOverlayOpacity75.description"),
    keywords: ["reference", "overlay", "opacity", "75"],
    order: 92,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: true, opacity: 0.75 }),
    getAvailability: referenceOverlayAvailability,
  });
  registerQuickAction({
    id: "view.referenceOverlay.opacity.100",
    section: "view",
    title: qa("action.referenceOverlayOpacity100.title"),
    description: qa("action.referenceOverlayOpacity100.description"),
    keywords: ["reference", "overlay", "opacity", "100", "full"],
    order: 93,
    run: () =>
      useViewportStore
        .getState()
        .setReferenceOverlaySettings({ enabled: true, opacity: 1 }),
    getAvailability: referenceOverlayAvailability,
  });

  const meshHeatmapAvailability = () => {
    const { activeTool } = useViewportStore.getState();
    const { editTarget } = usePuppetWarpStore.getState();
    const currentSelectedViviMesh = getCurrentSelectedViviMesh();
    if (!project) {
      return { enabled: false, reason: requiresProjectReason };
    }
    if (
      !currentSelectedViviMesh ||
      activeTool !== "meshEdit" ||
      editTarget !== "clip"
    ) {
      return {
        enabled: false,
        reason: meshHeatmapSelectionReason,
      };
    }
    return { enabled: true };
  };
  registerQuickAction({
    id: "view.meshHeatmap.toggle",
    section: "view",
    title: meshHeatmap.enabled
      ? qa("action.meshHeatmapToggle.disable")
      : qa("action.meshHeatmapToggle.enable"),
    description: qa("action.meshHeatmapToggle.description"),
    keywords: ["mesh", "heatmap", "overlay", "clip"],
    order: 93,
    run: () => {
      const current = useViewportStore.getState().meshHeatmap;
      useViewportStore
        .getState()
        .setMeshHeatmapSettings({ enabled: !current.enabled });
    },
    getAvailability: meshHeatmapAvailability,
  });
  registerQuickAction({
    id: "view.meshHeatmap.intensity.50",
    section: "view",
    title: qa("action.meshHeatmapIntensity50.title"),
    description: qa("action.meshHeatmapIntensity50.description"),
    keywords: ["mesh", "heatmap", "intensity", "50"],
    order: 94,
    run: () =>
      useViewportStore
        .getState()
        .setMeshHeatmapSettings({ enabled: true, intensity: 0.5 }),
    getAvailability: meshHeatmapAvailability,
  });
  registerQuickAction({
    id: "view.meshHeatmap.intensity.100",
    section: "view",
    title: qa("action.meshHeatmapIntensity100.title"),
    description: qa("action.meshHeatmapIntensity100.description"),
    keywords: ["mesh", "heatmap", "intensity", "100"],
    order: 95,
    run: () =>
      useViewportStore
        .getState()
        .setMeshHeatmapSettings({ enabled: true, intensity: 1 }),
    getAvailability: meshHeatmapAvailability,
  });
  registerQuickAction({
    id: "view.meshHeatmap.intensity.150",
    section: "view",
    title: qa("action.meshHeatmapIntensity150.title"),
    description: qa("action.meshHeatmapIntensity150.description"),
    keywords: ["mesh", "heatmap", "intensity", "150"],
    order: 96,
    run: () =>
      useViewportStore
        .getState()
        .setMeshHeatmapSettings({ enabled: true, intensity: 1.5 }),
    getAvailability: meshHeatmapAvailability,
  });
  registerQuickAction({
    id: "view.meshHeatmap.intensity.200",
    section: "view",
    title: qa("action.meshHeatmapIntensity200.title"),
    description: qa("action.meshHeatmapIntensity200.description"),
    keywords: ["mesh", "heatmap", "intensity", "200"],
    order: 97,
    run: () =>
      useViewportStore
        .getState()
        .setMeshHeatmapSettings({ enabled: true, intensity: 2 }),
    getAvailability: meshHeatmapAvailability,
  });
}
