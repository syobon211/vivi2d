import { flattenLayers } from "@vivi2d/core/layer-utils";
import { isBone, type LayerNode } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import {
  assessReferenceOverlayCompareSummary,
  getReferenceOverlayCompareSummary,
  REFERENCE_OVERLAY_COMPARE_PRESETS,
} from "@/lib/reference-overlay-utils";
import type { useEditorStore } from "@/stores/editorStore";
import type { PuppetWarpGroup, PuppetWarpPin } from "@/stores/puppetWarpStore";
import type { useViewportStore } from "@/stores/viewportStore";

type ReferenceOverlayText = {
  modes: Record<"source" | "currentBounds" | "importedBounds" | "compareBounds", string>;
  assessments: Record<
    "aligned" | "offsetDrift" | "scaleDrift" | "offsetAndScaleDrift",
    string
  >;
  presets: Record<"sourceCurrent" | "sourceImported" | "currentImported", string>;
  unknownAssessment: string;
};

function findSelectedPins(
  pins: ReadonlyArray<PuppetWarpPin>,
  selectedPinIds: ReadonlyArray<string>,
): PuppetWarpPin[] {
  const selected = new Set(selectedPinIds);
  return pins.filter((pin) => selected.has(pin.id));
}

export function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function useMeshPropertiesDerivedState({
  layer,
  project,
  pins,
  groups,
  selectedPinIds,
  referenceOverlay,
  accessoryFollowBoneId,
  referenceText,
}: {
  layer: LayerNode;
  project: ReturnType<typeof useEditorStore.getState>["project"];
  pins: PuppetWarpPin[];
  groups: PuppetWarpGroup[];
  selectedPinIds: string[];
  referenceOverlay: ReturnType<typeof useViewportStore.getState>["referenceOverlay"];
  accessoryFollowBoneId: string;
  referenceText: ReferenceOverlayText;
}) {
  const selectedPins = useMemo(
    () => findSelectedPins(pins, selectedPinIds),
    [pins, selectedPinIds],
  );
  const referenceOverlayCompareSummary = useMemo(
    () =>
      referenceOverlay.mode === "compareBounds" ||
      referenceOverlay.pinCompareSummary === true
        ? getReferenceOverlayCompareSummary(
            layer,
            referenceOverlay.comparePrimary ?? "currentBounds",
            referenceOverlay.compareSecondary ?? "importedBounds",
          )
        : null,
    [
      layer,
      referenceOverlay.mode,
      referenceOverlay.pinCompareSummary,
      referenceOverlay.comparePrimary,
      referenceOverlay.compareSecondary,
    ],
  );
  const referenceOverlayCompareAssessment = useMemo(
    () => assessReferenceOverlayCompareSummary(referenceOverlayCompareSummary),
    [referenceOverlayCompareSummary],
  );
  const activeReferenceOverlayComparePreset = useMemo(
    () =>
      REFERENCE_OVERLAY_COMPARE_PRESETS.find(
        (preset) =>
          preset.primary === (referenceOverlay.comparePrimary ?? "currentBounds") &&
          preset.secondary === (referenceOverlay.compareSecondary ?? "importedBounds"),
      ) ?? null,
    [referenceOverlay.comparePrimary, referenceOverlay.compareSecondary],
  );
  const getReferenceModeLabel = useCallback(
    (mode: "source" | "currentBounds" | "importedBounds" | "compareBounds") =>
      referenceText.modes[mode],
    [referenceText],
  );
  const getReferenceAssessmentLabel = useCallback(
    (
      status:
        | "aligned"
        | "offsetDrift"
        | "scaleDrift"
        | "offsetAndScaleDrift"
        | null
        | undefined,
    ) => (status ? referenceText.assessments[status] : referenceText.unknownAssessment),
    [referenceText],
  );
  const getReferencePresetLabel = useCallback(
    (id: "sourceCurrent" | "sourceImported" | "currentImported") =>
      referenceText.presets[id],
    [referenceText],
  );
  const selectedHandlePins = selectedPins.filter((pin) => pin.kind === "handle");
  const selectedAnchorPins = selectedPins.filter((pin) => pin.kind === "anchor");
  const selectedPinPrototype = selectedPins[0] ?? null;
  const boneOptions = useMemo(() => {
    if (!project) return [];
    return flattenLayers(project.layers)
      .filter(isBone)
      .map((bone) => ({ id: bone.id, name: bone.name }));
  }, [project]);
  const effectiveAccessoryFollowBoneId =
    accessoryFollowBoneId && boneOptions.some((bone) => bone.id === accessoryFollowBoneId)
      ? accessoryFollowBoneId
      : (boneOptions[0]?.id ?? "");

  return {
    activeReferenceOverlayComparePreset,
    boneOptions,
    effectiveAccessoryFollowBoneId,
    getReferenceAssessmentLabel,
    getReferenceModeLabel,
    getReferencePresetLabel,
    groupsCount: groups.length,
    referenceOverlayCompareAssessment,
    referenceOverlayCompareSummary,
    selectedAnchorPins,
    selectedHandlePins,
    selectedPinPrototype,
    selectedPins,
  };
}
