import { z } from "zod";
import {
  viewerCalibrationConfigSchema,
  type ViewerCalibrationConfig,
} from "./calibration/calibration-types";
import type { RecordingFormat } from "./recorder";
import {
  PLATFORM_FACE_CHANNEL_NAMES,
  type PlatformFaceTrackingMap,
} from "./tracking/platform-face-channels";
import type { TrackingParameterMap } from "./tracking/face-mapper";
import type { GamepadMapping } from "./tracking/gamepad-controller";
import type { HandTrackingParameterMap } from "./tracking/hand-mapper";
import type { LipSyncMode } from "./tracking/lipsync-analyser";
import type { MidiMapping } from "./tracking/midi-controller";
import type { PoseTrackingParameterMap } from "./tracking/pose-mapper";

const STORAGE_KEY = "vivi-viewer-settings";

export interface ViewerLocalPreferences {
  bgMode: "transparent" | "green" | "blue";

  smoothing: number;

  cameraDeviceId: string;

  lastModelPath?: string;

  alwaysOnTop: boolean;

  lipSyncMode: LipSyncMode;

  recordingFormat: RecordingFormat;

  colliderEffects: boolean;

  recommendationSuppressions: Partial<Record<"connect" | "calibrate", number>>;
}

export type ViewerSettings = ViewerLocalPreferences;

export type PortableViewerSettings = Pick<
  ViewerLocalPreferences,
  | "bgMode"
  | "smoothing"
  | "alwaysOnTop"
  | "lipSyncMode"
  | "recordingFormat"
  | "colliderEffects"
>;

export interface TrackingConfig {
  face?: TrackingParameterMap;
  platformFace?: PlatformFaceTrackingMap;
  hand?: HandTrackingParameterMap;
  pose?: PoseTrackingParameterMap;
  gamepad?: GamepadMapping[];
  midi?: MidiMapping[];
  calibration?: ViewerCalibrationConfig;
}

export interface ViewerConfigExport {
  version: 1;
  settings: PortableViewerSettings;
  tracking?: TrackingConfig;
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  bgMode: "transparent",
  smoothing: 0.6,
  cameraDeviceId: "",
  alwaysOnTop: false,
  lipSyncMode: "rms",
  recordingFormat: "webm",
  colliderEffects: true,
  recommendationSuppressions: {},
};

const DEFAULT_PORTABLE_SETTINGS: PortableViewerSettings = {
  bgMode: DEFAULT_SETTINGS.bgMode,
  smoothing: DEFAULT_SETTINGS.smoothing,
  alwaysOnTop: DEFAULT_SETTINGS.alwaysOnTop,
  lipSyncMode: DEFAULT_SETTINGS.lipSyncMode,
  recordingFormat: DEFAULT_SETTINGS.recordingFormat,
  colliderEffects: DEFAULT_SETTINGS.colliderEffects,
};

const BG_MODES = ["transparent", "green", "blue"] as const;
const LIP_SYNC_MODES = ["rms", "viseme"] as const;
const RECORDING_FORMATS = ["webm", "mp4", "gif"] as const;
const FACE_TRACKING_KEYS = [
  "eyeOpenLeft",
  "eyeOpenRight",
  "mouthOpen",
  "mouthWidth",
  "headRotationX",
  "headRotationY",
  "headRotationZ",
  "browLeftY",
  "browRightY",
] as const satisfies readonly (keyof TrackingParameterMap)[];
const HAND_TRACKING_KEYS = [
  "handLX",
  "handLY",
  "handLGrip",
  "handRX",
  "handRY",
  "handRGrip",
] as const satisfies readonly (keyof HandTrackingParameterMap)[];
const POSE_TRACKING_KEYS = [
  "bodyRotZ",
  "armLRaise",
  "armRRaise",
  "armLBend",
  "armRBend",
] as const satisfies readonly (keyof PoseTrackingParameterMap)[];

const viewerSettingsInputSchema = z.object({
  bgMode: z.enum(BG_MODES).optional().catch(undefined),
  smoothing: z.number().min(0).max(1).optional().catch(undefined),
  cameraDeviceId: z.string().max(1024).optional().catch(undefined),
  lastModelPath: z.string().max(4096).optional().catch(undefined),
  alwaysOnTop: z.boolean().optional().catch(undefined),
  lipSyncMode: z.enum(LIP_SYNC_MODES).optional().catch(undefined),
  recordingFormat: z.enum(RECORDING_FORMATS).optional().catch(undefined),
  colliderEffects: z.boolean().optional().catch(undefined),
  recommendationSuppressions: z
    .object({
      connect: z.number().finite().nonnegative().optional(),
      calibrate: z.number().finite().nonnegative().optional(),
    })
    .strict()
    .optional()
    .catch(undefined),
});

const portableViewerSettingsInputSchema = z.object({
  bgMode: z.enum(BG_MODES).optional().catch(undefined),
  smoothing: z.number().min(0).max(1).optional().catch(undefined),
  alwaysOnTop: z.boolean().optional().catch(undefined),
  lipSyncMode: z.enum(LIP_SYNC_MODES).optional().catch(undefined),
  recordingFormat: z.enum(RECORDING_FORMATS).optional().catch(undefined),
  colliderEffects: z.boolean().optional().catch(undefined),
});

const LOCAL_SETTING_KEYS = [
  "bgMode",
  "smoothing",
  "cameraDeviceId",
  "lastModelPath",
  "alwaysOnTop",
  "lipSyncMode",
  "recordingFormat",
  "colliderEffects",
  "recommendationSuppressions",
] as const satisfies readonly (keyof ViewerSettings)[];

const PORTABLE_SETTING_KEYS = [
  "bgMode",
  "smoothing",
  "alwaysOnTop",
  "lipSyncMode",
  "recordingFormat",
  "colliderEffects",
] as const satisfies readonly (keyof PortableViewerSettings)[];

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function pickDefined<
  T extends object,
  K extends keyof T,
>(obj: Partial<T>, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) {
      out[key] = value as Pick<T, K>[K];
    }
  }
  return out;
}

function parseViewerSettings(input: unknown): ViewerSettings {
  const result = viewerSettingsInputSchema.safeParse(input);
  if (!result.success) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...pickDefined(
      dropUndefined(result.data) as Partial<ViewerSettings>,
      LOCAL_SETTING_KEYS,
    ),
  };
}

function toPortableViewerSettings(settings: ViewerSettings): PortableViewerSettings {
  return {
    ...DEFAULT_PORTABLE_SETTINGS,
    ...pickDefined(
      settings as Partial<PortableViewerSettings>,
      PORTABLE_SETTING_KEYS,
    ),
  };
}

const parameterIdSchema = z.string().min(1).max(256);

function strictParameterMapSchema(keys: readonly string[]) {
  const allowed = new Set(keys);
  return z.preprocess(
    (input) => {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return input;
      }
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(input)) {
        if (
          allowed.has(key) &&
          typeof value === "string" &&
          value.length > 0 &&
          value.length <= 256
        ) {
          filtered[key] = value;
        }
      }
      return filtered;
    },
    z.object(
      Object.fromEntries(
        keys.map((key) => [key, parameterIdSchema.optional()]),
      ),
    )
      .strict(),
  );
}

const faceTrackingMapSchema = strictParameterMapSchema(FACE_TRACKING_KEYS);
const platformFaceTrackingMapSchema = strictParameterMapSchema(
  PLATFORM_FACE_CHANNEL_NAMES,
);
const handTrackingMapSchema = strictParameterMapSchema(HAND_TRACKING_KEYS);
const poseTrackingMapSchema = strictParameterMapSchema(POSE_TRACKING_KEYS);

const gamepadMappingSchema = z
  .object({
    type: z.enum(["axis", "button"]),
    index: z.number().int().min(0).max(64),
    parameterId: z.string().min(1).max(256),
    scale: z.number().finite().min(-100).max(100).optional(),
    deadzone: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

const midiMappingSchema = z
  .object({
    channel: z.number().int().min(0).max(15).optional(),
    cc: z.number().int().min(0).max(127),
    parameterId: z.string().min(1).max(256),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict();

const trackingConfigInputSchema = z
  .object({
    face: faceTrackingMapSchema.optional().catch(undefined),
    platformFace: platformFaceTrackingMapSchema.optional().catch(undefined),
    hand: handTrackingMapSchema.optional().catch(undefined),
    pose: poseTrackingMapSchema.optional().catch(undefined),
    gamepad: z.array(gamepadMappingSchema).max(128).optional().catch(undefined),
    midi: z.array(midiMappingSchema).max(128).optional().catch(undefined),
    calibration: viewerCalibrationConfigSchema.optional().catch(undefined),
  })
  .strict();

const viewerConfigExportSchema = z.object({
  version: z.literal(1),
  settings: portableViewerSettingsInputSchema,
  tracking: trackingConfigInputSchema.optional(),
});

function parseTrackingConfig(input: unknown): TrackingConfig | undefined {
  if (input === undefined) return undefined;
  const result = trackingConfigInputSchema.safeParse(input);
  if (!result.success) return undefined;
  const tracking = dropUndefined(result.data) as TrackingConfig;
  return Object.keys(tracking).length > 0 ? tracking : undefined;
}

export function loadSettings(): ViewerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseViewerSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ViewerSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(parseViewerSettings(settings)),
    );
  } catch {}
}

export function updateSettings(partial: Partial<ViewerSettings>): ViewerSettings {
  const current = loadSettings();
  const updated = parseViewerSettings({ ...current, ...partial });
  saveSettings(updated);
  return updated;
}

export function exportConfig(
  settings: ViewerSettings,
  tracking?: TrackingConfig,
): string {
  const data: ViewerConfigExport = {
    version: 1,
    settings: toPortableViewerSettings(settings),
    tracking: parseTrackingConfig(tracking),
  };
  return JSON.stringify(data, null, 2);
}

export function importConfig(json: string): ViewerConfigExport | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  const result = viewerConfigExportSchema.safeParse(data);
  if (!result.success) return null;

  const settings: PortableViewerSettings = {
    ...DEFAULT_PORTABLE_SETTINGS,
    ...pickDefined(
      dropUndefined(result.data.settings) as Partial<PortableViewerSettings>,
      PORTABLE_SETTING_KEYS,
    ),
  };
  return {
    version: 1,
    settings,
    tracking: parseTrackingConfig(result.data.tracking),
  };
}

export function downloadConfig(
  settings: ViewerSettings,
  tracking?: TrackingConfig,
): void {
  const json = exportConfig(settings, tracking);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vivi-viewer-config.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
