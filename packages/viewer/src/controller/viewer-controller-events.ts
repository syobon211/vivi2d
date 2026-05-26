import type { ViviActionEvent } from "../actions/action-types";
import type { ViviTrackingCalibrationSnapshot } from "../calibration/calibration-store";
import type { ViviProp } from "../props/prop-types";

export type ViewerSignalSource =
  | "tracking"
  | "lipSync"
  | "inputDevice"
  | "script"
  | "ui";

export type ViewerControllerEvent =
  | {
      type: "viewer.snapshot.changed";
      snapshot: ViewerControllerSnapshot;
    }
  | {
      type: "viewer.prop.event";
      event: "added" | "updated" | "removed";
      propId: string;
      prop?: ViviProp;
    }
  | {
      type: "viewer.calibration.changed";
      snapshot: ViviTrackingCalibrationSnapshot;
    }
  | {
      type: "viewer.action.event";
      event: ViviActionEvent;
    }
  | {
      type: "viewer.signals.changed";
      source?: ViewerSignalSource;
      signalIds: string[];
    };

export interface ViewerControllerSnapshot {
  props: ViviProp[];
  calibration: ViviTrackingCalibrationSnapshot;
  actionEvents: ViviActionEvent[];
}

export type ViewerControllerListener = (event: ViewerControllerEvent) => void;
