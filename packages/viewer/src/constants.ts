export const VIEWER_DEFAULTS = {
  SMOOTHING: 0.6,
  SMOOTHING_MIN: 0,
  SMOOTHING_MAX: 0.95,
  SMOOTHING_STEP: 0.05,
} as const;

export const UI_TIMING = {
  HIT_DISPLAY_MS: 2000,
  PRESET_DISPLAY_MS: 1500,
  HUD_UPDATE_INTERVAL: 30,
  RECORDING_TIMER_MS: 200,
  TOAST_DISPLAY_MS: 2000,
} as const;

export const TRACKING_COUNTS = {
  FACE: 9,
  PLATFORM_FACE: 52,
  HAND: 6,
  POSE: 5,
} as const;

export const COLLIDER_EFFECT_MAP: Record<string, string> = {
  head: "hearts",
  hair: "sparkles",
  body: "stars",
  face: "hearts",
  hand: "sparkles",
  default: "confetti",
} as const;

export const RECORDING_MAX_DURATION = 60;
