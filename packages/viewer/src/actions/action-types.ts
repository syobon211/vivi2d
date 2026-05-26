import { z } from "zod";
import { viewerBridgeCommandPayloadSchema } from "../bridges/bridge-registry";

export const VIVI_ACTION_KINDS = [
  "signalSet",
  "signalPulse",
  "expressionPreset",
  "modelTransform",
  "propTransform",
  "propVisibility",
  "propCycle",
  "propSpawnBurst",
  "effectPreset",
  "recordingControl",
  "scriptCommand",
  "bridgeCommand",
  "calibrationProfileApply",
  "calibrationCaptureNeutral",
  "calibrationReset",
] as const;

export type ViviActionKind = (typeof VIVI_ACTION_KINDS)[number];

export type ViviActionQueuePolicy = "drop" | "replace" | "enqueue";

export type ViviActionSource = "builtIn" | "user" | "imported";

export type ViviActionTriggerSource =
  | "keyboard"
  | "midi"
  | "gamepad"
  | "viewerApi"
  | "script"
  | "ui";

export interface ViviAction {
  id: string;
  name: string;
  kind: ViviActionKind;
  enabled: boolean;
  payload: unknown;
  cooldownMs?: number;
  queuePolicy?: ViviActionQueuePolicy;
  source?: ViviActionSource;
}

export interface ViviActionTrigger {
  id: string;
  actionId: string;
  source: ViviActionTriggerSource;
  match: unknown;
  enabled: boolean;
}

export type ViviPublicActionScope =
  | "run:actions:safe"
  | "write:signals"
  | "write:props"
  | "write:calibration";

export type ViviInternalActionScope =
  | "run:actions:recording"
  | "run:actions:script"
  | "bridge:scene";

export type ViviActionScope = ViviPublicActionScope | ViviInternalActionScope;

// Public Viewer API clients can only request these safe, user-grantable scopes.
export const ALL_VIVI_ACTION_SCOPES = [
  "run:actions:safe",
  "write:signals",
  "write:props",
  "write:calibration",
] as const satisfies readonly ViviPublicActionScope[];

// Trusted in-app triggers may use reserved scopes that are never grantable over
// the external Viewer API.
export const TRUSTED_VIVI_ACTION_SCOPES = [
  ...ALL_VIVI_ACTION_SCOPES,
  "run:actions:recording",
  "run:actions:script",
  "bridge:scene",
] as const satisfies readonly ViviActionScope[];

export type ViviActionEventStatus =
  | "started"
  | "completed"
  | "failed"
  | "skipped";

export interface ViviActionEvent {
  actionId: string;
  kind: ViviActionKind;
  status: ViviActionEventStatus;
  triggerSource?: ViviActionTriggerSource;
  error?: string;
  timestamp: number;
}

const numericPatchSchema = z
  .record(z.string().min(1).max(256), z.number().finite())
  .refine((value) => Object.keys(value).length <= 128, {
    message: "signal patch has too many entries",
  });

export const signalSetPayloadSchema = z.object({
  values: numericPatchSchema,
});

export const signalPulsePayloadSchema = z.object({
  values: numericPatchSchema,
  durationMs: z.number().int().min(1).max(10_000).optional(),
  restore: z.boolean().optional(),
});

export const expressionPresetPayloadSchema = z.object({
  presetId: z.string().min(1).max(256),
});

export const modelTransformPayloadSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  scale: z.number().finite().positive().max(100).optional(),
  rotation: z.number().finite().optional(),
});

export const propTransformPayloadSchema = z.object({
  propId: z.string().min(1).max(256),
  transform: z
    .object({
      x: z.number().finite().optional(),
      y: z.number().finite().optional(),
      scaleX: z.number().finite().min(0.01).max(100).optional(),
      scaleY: z.number().finite().min(0.01).max(100).optional(),
      rotation: z.number().finite().optional(),
      opacity: z.number().finite().min(0).max(1).optional(),
    })
    .strict(),
});

export const propVisibilityPayloadSchema = z.object({
  propId: z.string().min(1).max(256),
  visible: z.boolean(),
});

export const propCyclePayloadSchema = z.object({
  groupId: z.string().min(1).max(256),
  direction: z.enum(["next", "previous"]).default("next"),
});

export const propSpawnBurstPayloadSchema = z.object({
  propIds: z.array(z.string().min(1).max(256)).min(1).max(16),
});

export const effectPresetPayloadSchema = z.object({
  effectId: z.enum(["confetti", "hearts", "stars", "sparkles"]),
});

export const recordingControlPayloadSchema = z.object({
  state: z.enum(["start", "stop", "toggle"]),
});

export const scriptCommandPayloadSchema = z.object({
  script: z.string().min(1).max(16_384),
});

export const bridgeCommandPayloadSchema = viewerBridgeCommandPayloadSchema;

export const calibrationProfileApplyPayloadSchema = z.object({
  profileId: z.string().min(1).max(256),
});

export const calibrationCaptureNeutralPayloadSchema = z.object({
  source: z.enum(["face", "platformFace", "hand", "pose", "lipSync"]),
});

export const calibrationResetPayloadSchema = z.object({
  profileId: z.string().min(1).max(256).optional(),
});

export const actionPayloadSchemas = {
  signalSet: signalSetPayloadSchema,
  signalPulse: signalPulsePayloadSchema,
  expressionPreset: expressionPresetPayloadSchema,
  modelTransform: modelTransformPayloadSchema,
  propTransform: propTransformPayloadSchema,
  propVisibility: propVisibilityPayloadSchema,
  propCycle: propCyclePayloadSchema,
  propSpawnBurst: propSpawnBurstPayloadSchema,
  effectPreset: effectPresetPayloadSchema,
  recordingControl: recordingControlPayloadSchema,
  scriptCommand: scriptCommandPayloadSchema,
  bridgeCommand: bridgeCommandPayloadSchema,
  calibrationProfileApply: calibrationProfileApplyPayloadSchema,
  calibrationCaptureNeutral: calibrationCaptureNeutralPayloadSchema,
  calibrationReset: calibrationResetPayloadSchema,
} satisfies Record<ViviActionKind, z.ZodType>;

export const viviActionSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  kind: z.enum(VIVI_ACTION_KINDS),
  enabled: z.boolean(),
  payload: z.unknown(),
  cooldownMs: z.number().int().min(0).max(3_600_000).optional(),
  queuePolicy: z.enum(["drop", "replace", "enqueue"]).optional(),
  source: z.enum(["builtIn", "user", "imported"]).optional(),
});

export function parseViviAction(action: unknown): ViviAction {
  const parsed = viviActionSchema.parse(action);
  const payload = actionPayloadSchemas[parsed.kind].parse(parsed.payload);
  return { ...parsed, payload };
}

export function getActionRequiredScope(kind: ViviActionKind): ViviActionScope {
  switch (kind) {
    case "signalSet":
    case "signalPulse":
      return "write:signals";
    case "propTransform":
    case "propVisibility":
    case "propCycle":
    case "propSpawnBurst":
      return "write:props";
    case "calibrationProfileApply":
    case "calibrationCaptureNeutral":
    case "calibrationReset":
      return "write:calibration";
    case "recordingControl":
      return "run:actions:recording";
    case "scriptCommand":
      return "run:actions:script";
    case "bridgeCommand":
      return "bridge:scene";
    default:
      return "run:actions:safe";
  }
}

export interface ImportedActionSafetyOptions {
  reviewedScriptActionIds?: ReadonlySet<string>;
  reviewedCalibrationActionIds?: ReadonlySet<string>;
}

export function assertImportedActionSafe(
  action: ViviAction,
  options: ImportedActionSafetyOptions = {},
): void {
  if (action.source !== "imported") return;
  if (action.kind === "scriptCommand") {
    if (!options.reviewedScriptActionIds?.has(action.id)) {
      throw new Error("Imported script actions require explicit review");
    }
  }
  if (
    (action.kind === "calibrationProfileApply" ||
      action.kind === "calibrationCaptureNeutral" ||
      action.kind === "calibrationReset") &&
    !options.reviewedCalibrationActionIds?.has(action.id)
  ) {
    throw new Error("Imported calibration actions require explicit review");
  }
  if (
    action.kind === "recordingControl" ||
    action.kind === "bridgeCommand"
  ) {
    throw new Error(`Imported action kind ${action.kind} is not allowed`);
  }
  // Other imported actions remain scalar/controller-scene operations bounded by
  // the payload schemas above. They cannot define scripts, bridge commands,
  // recording controls, calibration writes, or private model deformation data.
}
