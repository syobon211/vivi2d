import { z } from "zod";

export const VIVI_TRACKING_CALIBRATION_VERSION = 1;
export const MAX_CALIBRATION_PROFILES = 32;
export const MAX_CALIBRATION_CHANNELS = 512;

export const TRACKING_SIGNAL_SOURCES = [
  "face",
  "platformFace",
  "hand",
  "pose",
  "lipSync",
] as const;

export type TrackingSignalSource = (typeof TRACKING_SIGNAL_SOURCES)[number];

export const TRACKING_CALIBRATION_CURVES = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "step",
] as const;

export type TrackingCalibrationCurve =
  (typeof TRACKING_CALIBRATION_CURVES)[number];

const RESERVED_CHANNEL_ID_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isSafeCalibrationChannelId(channelId: string): boolean {
  return !channelId
    .split(".")
    .some((segment) => RESERVED_CHANNEL_ID_SEGMENTS.has(segment));
}

export interface ViviTrackingChannelCalibration {
  enabled: boolean;
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  neutral: number;
  deadzone: number;
  smoothing: number;
  invert: boolean;
  curve: TrackingCalibrationCurve;
}

export interface ViviTrackingCalibrationProfile {
  version: typeof VIVI_TRACKING_CALIBRATION_VERSION;
  id: string;
  name: string;
  channels: Record<string, ViviTrackingChannelCalibration>;
}

export interface ViewerCalibrationConfig {
  version: typeof VIVI_TRACKING_CALIBRATION_VERSION;
  activeProfileId?: string;
  profiles: ViviTrackingCalibrationProfile[];
}

export interface TrackingSignalFrame {
  source: TrackingSignalSource;
  timestamp: number;
  channels: Record<string, number>;
}

export interface TrackingCalibrationDiagnostic {
  channelId: string;
  source: TrackingSignalSource;
  raw: number;
  value: number;
  calibrated: boolean;
  inputMin?: number;
  inputMax?: number;
  neutral?: number;
  observedMin?: number;
  observedMax?: number;
  clipped?: boolean;
  stale?: boolean;
}

export interface TrackingCalibrationObservedRange {
  channelId: string;
  source: TrackingSignalSource;
  min: number;
  max: number;
  lastTimestamp: number;
}

export const DEFAULT_TRACKING_CHANNEL_CALIBRATION: ViviTrackingChannelCalibration = {
  enabled: true,
  inputMin: -1,
  inputMax: 1,
  outputMin: -1,
  outputMax: 1,
  neutral: 0,
  deadzone: 0,
  smoothing: 0,
  invert: false,
  curve: "linear",
};

export const trackingChannelCalibrationSchema = z
  .object({
    enabled: z.boolean(),
    inputMin: z.number().finite().min(-100).max(100),
    inputMax: z.number().finite().min(-100).max(100),
    outputMin: z.number().finite().min(-100).max(100),
    outputMax: z.number().finite().min(-100).max(100),
    neutral: z.number().finite().min(-100).max(100),
    deadzone: z.number().finite().min(0).max(10),
    smoothing: z.number().finite().min(0).max(0.99),
    invert: z.boolean(),
    curve: z.enum(TRACKING_CALIBRATION_CURVES),
  })
  .strict()
  .refine((value) => value.inputMin !== value.inputMax, {
    message: "input range must be non-zero",
  });

const channelRecordSchema = z
  .custom<Record<string, unknown>>(
    (value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const keys = Object.getOwnPropertyNames(value);
      return (
        keys.length <= MAX_CALIBRATION_CHANNELS &&
        keys.every(
          (key) =>
            key.length >= 1 &&
            key.length <= 256 &&
            isSafeCalibrationChannelId(key),
        )
      );
    },
    { message: "reserved calibration channel id" },
  )
  .pipe(z.record(z.string().min(1).max(256), trackingChannelCalibrationSchema))
  .refine((value) => Object.keys(value).length <= MAX_CALIBRATION_CHANNELS, {
    message: "too many calibration channels",
  });

export const trackingCalibrationProfileSchema = z
  .object({
    version: z.literal(VIVI_TRACKING_CALIBRATION_VERSION),
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    channels: channelRecordSchema,
  })
  .strict();

export const viewerCalibrationConfigSchema = z
  .object({
    version: z.literal(VIVI_TRACKING_CALIBRATION_VERSION),
    activeProfileId: z.string().min(1).max(256).optional(),
    profiles: z
      .array(trackingCalibrationProfileSchema)
      .max(MAX_CALIBRATION_PROFILES),
  })
  .strict();

export function parseTrackingCalibrationProfile(
  input: unknown,
): ViviTrackingCalibrationProfile {
  return trackingCalibrationProfileSchema.parse(
    input,
  ) as ViviTrackingCalibrationProfile;
}

export function parseViewerCalibrationConfig(input: unknown): ViewerCalibrationConfig {
  return viewerCalibrationConfigSchema.parse(input) as ViewerCalibrationConfig;
}
