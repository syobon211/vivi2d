import {
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
  type TrackingCalibrationDiagnostic,
  type TrackingSignalFrame,
  type TrackingSignalSource,
  type ViviTrackingCalibrationProfile,
  type ViviTrackingChannelCalibration,
} from "./calibration-types";

export interface CalibrationEngineState {
  previousCalibratedValues: Record<string, number>;
  previousFallbackValues: Record<string, number>;
}

export interface TrackingParameterRange {
  min: number;
  max: number;
}

export interface TrackingCalibrationRangeObservation {
  min: number;
  max: number;
  neutral?: number;
}

export interface ProcessTrackingSignalOptions {
  fallbackSmoothing?: number;
  parameterRanges?: Record<string, TrackingParameterRange>;
}

export interface ProcessedTrackingSignalFrame {
  frame: TrackingSignalFrame;
  diagnostics: TrackingCalibrationDiagnostic[];
}

export function createCalibrationEngineState(): CalibrationEngineState {
  return {
    previousCalibratedValues: {},
    previousFallbackValues: {},
  };
}

export function resetCalibrationEngineState(state: CalibrationEngineState): void {
  state.previousCalibratedValues = {};
  state.previousFallbackValues = {};
}

export function makeTrackingChannelId(
  source: TrackingSignalSource,
  channel: string,
): string {
  return `${source}.${channel}`;
}

function clamp(value: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, finiteValue));
}

function lerp(current: number, previous: number, previousWeight: number): number {
  return current + (previous - current) * previousWeight;
}

function applyCurve(value: number, curve: ViviTrackingChannelCalibration["curve"]): number {
  switch (curve) {
    case "easeIn":
      return value * value;
    case "easeOut":
      return 1 - (1 - value) * (1 - value);
    case "easeInOut":
      return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
    case "step":
      return value >= 0.5 ? 1 : 0;
    case "linear":
      return value;
  }
}

export function createTrackingSignalFrame(
  source: TrackingSignalSource,
  channels: Record<string, number>,
  timestamp = Date.now(),
): TrackingSignalFrame {
  const finiteChannels: Record<string, number> = {};
  for (const [channel, value] of Object.entries(channels)) {
    if (!channel || channel.length > 256 || !Number.isFinite(value)) continue;
    finiteChannels[channel] = value;
  }
  return { source, channels: finiteChannels, timestamp };
}

export function calibrateTrackingChannel(
  rawValue: number,
  calibration: ViviTrackingChannelCalibration,
  previousValue?: number,
  range?: TrackingParameterRange,
): number {
  const config = { ...DEFAULT_TRACKING_CHANNEL_CALIBRATION, ...calibration };
  const inputMin = Math.min(config.inputMin, config.inputMax) - config.neutral;
  const inputMax = Math.max(config.inputMin, config.inputMax) - config.neutral;
  const inputRange = inputMax - inputMin;
  if (inputRange <= Number.EPSILON) {
    return previousValue ?? rawValue;
  }
  const adjusted = rawValue - config.neutral;
  const deadzoned =
    Math.abs(adjusted) <= config.deadzone
      ? 0
      : Math.sign(adjusted) * (Math.abs(adjusted) - config.deadzone);
  const normalized = clamp((deadzoned - inputMin) / inputRange, 0, 1);
  const curved = applyCurve(config.invert ? 1 - normalized : normalized, config.curve);
  const output = config.outputMin + (config.outputMax - config.outputMin) * curved;
  const rangeMin = range ? Math.min(range.min, range.max) : Math.min(config.outputMin, config.outputMax);
  const rangeMax = range ? Math.max(range.min, range.max) : Math.max(config.outputMin, config.outputMax);
  const clamped = clamp(output, rangeMin, rangeMax);
  if (previousValue === undefined || config.smoothing <= 0) return clamped;
  return lerp(clamped, previousValue, config.smoothing);
}

export function suggestTrackingChannelCalibration(
  observation: TrackingCalibrationRangeObservation,
  previous: ViviTrackingChannelCalibration = DEFAULT_TRACKING_CHANNEL_CALIBRATION,
): ViviTrackingChannelCalibration {
  const neutral = Number.isFinite(observation.neutral)
    ? observation.neutral!
    : previous.neutral;
  let min = Math.min(observation.min, observation.max);
  let max = Math.max(observation.min, observation.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = neutral - 0.5;
    max = neutral + 0.5;
  }
  if (max - min < 0.01) {
    min = neutral - 0.5;
    max = neutral + 0.5;
  }
  const padding = Math.max((max - min) * 0.1, 0.01);
  return {
    ...previous,
    enabled: true,
    inputMin: clamp(min - padding, -100, 100),
    inputMax: clamp(max + padding, -100, 100),
    neutral: clamp(neutral, -100, 100),
  };
}

export function processTrackingSignalFrame(
  frame: TrackingSignalFrame,
  profile: ViviTrackingCalibrationProfile | null | undefined,
  state: CalibrationEngineState,
  options: ProcessTrackingSignalOptions = {},
): ProcessedTrackingSignalFrame {
  const outputChannels: Record<string, number> = {};
  const diagnostics: TrackingCalibrationDiagnostic[] = [];
  const fallbackSmoothing = clamp(options.fallbackSmoothing ?? 0, 0, 0.99);

  for (const [channel, raw] of Object.entries(frame.channels)) {
    const channelId = makeTrackingChannelId(frame.source, channel);
    const calibration = profile?.channels[channelId];
    const range = options.parameterRanges?.[channelId] ?? options.parameterRanges?.[channel];
    let value = raw;
    let calibrated = false;

    if (calibration?.enabled) {
      value = calibrateTrackingChannel(
        raw,
        calibration,
        state.previousCalibratedValues[channelId],
        range,
      );
      state.previousCalibratedValues[channelId] = value;
      calibrated = true;
    } else if (fallbackSmoothing > 0) {
      const previous = state.previousFallbackValues[channelId];
      value = previous === undefined ? raw : lerp(raw, previous, fallbackSmoothing);
      state.previousFallbackValues[channelId] = value;
    }

    outputChannels[channel] = value;
    diagnostics.push({
      channelId,
      source: frame.source,
      raw,
      value,
      calibrated,
      inputMin: calibration?.inputMin,
      inputMax: calibration?.inputMax,
      neutral: calibration?.neutral,
      clipped: calibration?.enabled
        ? raw <= Math.min(calibration.inputMin, calibration.inputMax) ||
          raw >= Math.max(calibration.inputMin, calibration.inputMax)
        : false,
    });
  }

  return {
    frame: { ...frame, channels: outputChannels },
    diagnostics,
  };
}
