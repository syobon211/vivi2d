import type { ComponentProps, ReactNode } from "react";
import { TrackingCalibrationPanel } from "../calibration/TrackingCalibrationPanel";
import { InputEffectsPanel } from "../components/InputEffectsPanel";
import { OverlaysPanel } from "../components/OverlaysPanel";
import { SessionPanel } from "../components/SessionPanel";
import { ViewerApiPanel } from "../components/ViewerApiPanel";
import type { ViewerSheetSection } from "../components/viewer-workflow";

export interface ViewerSideSheetSectionProps {
  session: ComponentProps<typeof SessionPanel>;
  connect: ComponentProps<typeof ViewerApiPanel>;
  overlays: ComponentProps<typeof OverlaysPanel>;
  calibration: ComponentProps<typeof TrackingCalibrationPanel>;
  inputEffects: ComponentProps<typeof InputEffectsPanel>;
}

export function createViewerSideSheetSections({
  session,
  connect,
  overlays,
  calibration,
  inputEffects,
}: ViewerSideSheetSectionProps): Record<ViewerSheetSection, ReactNode> {
  return {
    session: <SessionPanel {...session} />,
    connect: <ViewerApiPanel {...connect} />,
    overlays: <OverlaysPanel {...overlays} />,
    calibration: <TrackingCalibrationPanel {...calibration} />,
    inputEffects: <InputEffectsPanel {...inputEffects} />,
  };
}
