import type {
  RunActionOptions,
  ViviActionCapabilityProvider,
  ViewerPropTransformPatch,
} from "../actions/action-runner";
import type { ViviActionScope } from "../actions/action-types";
import type { TrackingSignalSource, ViewerCalibrationConfig } from "../calibration/calibration-types";
import type { ViewerSignalSource } from "./viewer-controller-events";

export type ViewerControllerActionRunOptions = Pick<
  RunActionOptions,
  "triggerSource" | "scopes"
>;

export interface ViewerControllerTrustedActionRunOptions
  extends ViewerControllerActionRunOptions {
  trustedTriggerSource?: boolean;
}

export interface ViewerControllerScopedCommand {
  scopes: readonly ViviActionScope[];
}

export type ViewerControllerCommand =
  | {
      type: "action.run";
      action: unknown;
      options?: ViewerControllerActionRunOptions;
    }
  | ({
      type: "props.add";
      prop: unknown;
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.update";
      prop: unknown;
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.remove";
      propId: string;
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.patchTransform";
      propId: string;
      transform: ViewerPropTransformPatch;
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.setVisible";
      propId: string;
      visible: boolean;
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.cycleGroup";
      groupId: string;
      direction?: "next" | "previous";
    } & ViewerControllerScopedCommand)
  | ({
      type: "props.spawnBurst";
      propIds: string[];
    } & ViewerControllerScopedCommand)
  | ({
      type: "calibration.applyProfile";
      profileId: string;
    } & ViewerControllerScopedCommand)
  | ({
      type: "calibration.captureNeutral";
      source: TrackingSignalSource;
    } & ViewerControllerScopedCommand)
  | ({
      type: "calibration.suggestRanges";
      source: TrackingSignalSource;
    } & ViewerControllerScopedCommand)
  | ({
      type: "calibration.reset";
      profileId?: string;
    } & ViewerControllerScopedCommand)
  | ({
      type: "calibration.importConfig";
      config: ViewerCalibrationConfig;
    } & ViewerControllerScopedCommand)
  | {
      type: "signals.set";
      values: Record<string, number>;
      scopes: readonly ViviActionScope[];
      source?: ViewerSignalSource;
    };

export interface ViewerControllerPorts {
  actionCapabilities?: ViviActionCapabilityProvider;
}

export interface ViewerCommandResult {
  accepted: boolean;
  reason?: string;
}
