import {
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
  VIVI_TRACKING_CALIBRATION_VERSION,
  type ViviTrackingCalibrationProfile,
  type ViviTrackingChannelCalibration,
} from "./calibration-types";

function channel(
  inputMin: number,
  inputMax: number,
  smoothing: number,
  extra: Partial<ViviTrackingChannelCalibration> = {},
): ViviTrackingChannelCalibration {
  return {
    ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
    inputMin,
    inputMax,
    outputMin: inputMin,
    outputMax: inputMax,
    smoothing,
    ...extra,
  };
}

const COMMON_CHANNELS: Record<string, { min: number; max: number }> = {
  "face.eyeOpenLeft": { min: 0, max: 1 },
  "face.eyeOpenRight": { min: 0, max: 1 },
  "face.mouthOpen": { min: 0, max: 1 },
  "face.mouthWidth": { min: 0, max: 1 },
  "face.headRotationX": { min: -1, max: 1 },
  "face.headRotationY": { min: -1, max: 1 },
  "face.headRotationZ": { min: -1, max: 1 },
  "face.browLeftY": { min: -1, max: 1 },
  "face.browRightY": { min: -1, max: 1 },
  "hand.handLX": { min: -1, max: 1 },
  "hand.handLY": { min: -1, max: 1 },
  "hand.handLGrip": { min: 0, max: 1 },
  "hand.handRX": { min: -1, max: 1 },
  "hand.handRY": { min: -1, max: 1 },
  "hand.handRGrip": { min: 0, max: 1 },
  "pose.bodyRotZ": { min: -1, max: 1 },
  "pose.armLRaise": { min: 0, max: 1 },
  "pose.armRRaise": { min: 0, max: 1 },
  "pose.armLBend": { min: 0, max: 1 },
  "pose.armRBend": { min: 0, max: 1 },
  "lipSync.mouthOpen": { min: 0, max: 1 },
  "lipSync.mouthWidth": { min: 0, max: 1 },
};

function makeChannels(
  smoothing: number,
  extra: Partial<ViviTrackingChannelCalibration> = {},
): Record<string, ViviTrackingChannelCalibration> {
  const channels: Record<string, ViviTrackingChannelCalibration> = {};
  for (const [id, range] of Object.entries(COMMON_CHANNELS)) {
    channels[id] = channel(range.min, range.max, smoothing, extra);
  }
  return channels;
}

function makeProfile(
  id: string,
  name: string,
  channels: Record<string, ViviTrackingChannelCalibration>,
): ViviTrackingCalibrationProfile {
  return {
    version: VIVI_TRACKING_CALIBRATION_VERSION,
    id,
    name,
    channels,
  };
}

export const BUILTIN_TRACKING_CALIBRATION_PROFILES = [
  makeProfile("balanced", "Balanced", makeChannels(0.35, { deadzone: 0.01 })),
  makeProfile("expressive", "Expressive", makeChannels(0.18, { deadzone: 0 })),
  makeProfile("stable", "Stable", makeChannels(0.7, { deadzone: 0.03 })),
  makeProfile("lowLightWebcam", "Low Light Webcam", makeChannels(0.82, { deadzone: 0.05 })),
  makeProfile(
    "mouthOnly",
    "Mouth Only",
    {
      "face.mouthOpen": channel(0, 1, 0.45, { deadzone: 0.02 }),
      "face.mouthWidth": channel(0, 1, 0.45, { deadzone: 0.02 }),
      "lipSync.mouthOpen": channel(0, 1, 0.25, { deadzone: 0.01 }),
      "lipSync.mouthWidth": channel(0, 1, 0.25, { deadzone: 0.01 }),
    },
  ),
] as const satisfies readonly ViviTrackingCalibrationProfile[];

export function cloneCalibrationProfile(
  profile: ViviTrackingCalibrationProfile,
): ViviTrackingCalibrationProfile {
  return JSON.parse(JSON.stringify(profile)) as ViviTrackingCalibrationProfile;
}
