import {
  createCalibrationEngineState,
  createTrackingSignalFrame,
  makeTrackingChannelId,
  processTrackingSignalFrame,
  resetCalibrationEngineState,
  suggestTrackingChannelCalibration,
  type CalibrationEngineState,
  type ProcessTrackingSignalOptions,
} from "./calibration-engine";
import {
  DEFAULT_TRACKING_CHANNEL_CALIBRATION,
  VIVI_TRACKING_CALIBRATION_VERSION,
  parseTrackingCalibrationProfile,
  parseViewerCalibrationConfig,
  type TrackingCalibrationDiagnostic,
  type TrackingCalibrationObservedRange,
  type TrackingSignalFrame,
  type TrackingSignalSource,
  type ViewerCalibrationConfig,
  type ViviTrackingCalibrationProfile,
} from "./calibration-types";
import {
  BUILTIN_TRACKING_CALIBRATION_PROFILES,
  cloneCalibrationProfile,
} from "./calibration-presets";

const TRACKING_STALE_THRESHOLD_MS = 1000;
const MAX_OBSERVED_CALIBRATION_RANGES = 512;

export interface ViviTrackingCalibrationSnapshot {
  activeProfileId: string;
  profiles: ViviTrackingCalibrationProfile[];
  diagnostics: TrackingCalibrationDiagnostic[];
  observedRanges: TrackingCalibrationObservedRange[];
}

export class ViviTrackingCalibrationStore {
  private profiles = new Map<string, ViviTrackingCalibrationProfile>();
  private activeProfileId = "balanced";
  private engineState: CalibrationEngineState = createCalibrationEngineState();
  private latestFrames = new Map<TrackingSignalSource, TrackingSignalFrame>();
  private observedRanges = new Map<string, TrackingCalibrationObservedRange>();
  private diagnostics: TrackingCalibrationDiagnostic[] = [];

  constructor(profiles: readonly ViviTrackingCalibrationProfile[] = BUILTIN_TRACKING_CALIBRATION_PROFILES) {
    for (const profile of profiles) {
      const parsed = parseTrackingCalibrationProfile(profile);
      this.profiles.set(parsed.id, cloneCalibrationProfile(parsed));
    }
    if (!this.profiles.has(this.activeProfileId)) {
      this.activeProfileId = this.profiles.keys().next().value ?? "balanced";
    }
  }

  snapshot(): ViviTrackingCalibrationSnapshot {
    return {
      activeProfileId: this.activeProfileId,
      profiles: [...this.profiles.values()].map(cloneCalibrationProfile),
      diagnostics: this.enrichedDiagnostics(),
      observedRanges: [...this.observedRanges.values()].map((range) => ({ ...range })),
    };
  }

  activeProfile(): ViviTrackingCalibrationProfile | null {
    return this.profiles.get(this.activeProfileId) ?? null;
  }

  exportConfig(): ViewerCalibrationConfig {
    return {
      version: VIVI_TRACKING_CALIBRATION_VERSION,
      activeProfileId: this.activeProfileId,
      profiles: [...this.profiles.values()].map(cloneCalibrationProfile),
    };
  }

  importConfig(input: unknown): ViewerCalibrationConfig {
    const parsed = parseViewerCalibrationConfig(input);
    this.profiles.clear();
    for (const profile of parsed.profiles) {
      this.profiles.set(profile.id, cloneCalibrationProfile(profile));
    }
    if (this.profiles.size === 0) {
      for (const profile of BUILTIN_TRACKING_CALIBRATION_PROFILES) {
        this.profiles.set(profile.id, cloneCalibrationProfile(profile));
      }
    }
    this.activeProfileId =
      parsed.activeProfileId && this.profiles.has(parsed.activeProfileId)
        ? parsed.activeProfileId
        : (this.profiles.keys().next().value ?? "balanced");
    resetCalibrationEngineState(this.engineState);
    this.latestFrames.clear();
    this.observedRanges.clear();
    this.diagnostics = [];
    return this.exportConfig();
  }

  setProfile(input: unknown): ViviTrackingCalibrationProfile {
    const parsed = parseTrackingCalibrationProfile(input);
    this.profiles.set(parsed.id, cloneCalibrationProfile(parsed));
    resetCalibrationEngineState(this.engineState);
    this.observedRanges.clear();
    return parsed;
  }

  applyProfile(profileId: string): boolean {
    if (!this.profiles.has(profileId)) return false;
    this.activeProfileId = profileId;
    resetCalibrationEngineState(this.engineState);
    this.observedRanges.clear();
    return true;
  }

  reset(profileId?: string): void {
    if (profileId) {
      const builtin = BUILTIN_TRACKING_CALIBRATION_PROFILES.find(
        (profile) => profile.id === profileId,
      );
      if (builtin) this.profiles.set(profileId, cloneCalibrationProfile(builtin));
    } else {
      this.profiles.clear();
      for (const profile of BUILTIN_TRACKING_CALIBRATION_PROFILES) {
        this.profiles.set(profile.id, cloneCalibrationProfile(profile));
      }
      this.activeProfileId = "balanced";
    }
    resetCalibrationEngineState(this.engineState);
    this.observedRanges.clear();
  }

  recordFrame(frame: TrackingSignalFrame): void {
    this.latestFrames.set(frame.source, frame);
    for (const [channel, value] of Object.entries(frame.channels)) {
      if (!Number.isFinite(value)) continue;
      const channelId = makeTrackingChannelId(frame.source, channel);
      const existing = this.observedRanges.get(channelId);
      this.observedRanges.set(channelId, {
        channelId,
        source: frame.source,
        min: existing ? Math.min(existing.min, value) : value,
        max: existing ? Math.max(existing.max, value) : value,
        lastTimestamp: frame.timestamp,
      });
      this.trimObservedRanges();
    }
  }

  latestFrame(source: TrackingSignalSource): TrackingSignalFrame | null {
    return this.latestFrames.get(source) ?? null;
  }

  processFrame(
    frame: TrackingSignalFrame,
    options: ProcessTrackingSignalOptions = {},
  ): TrackingSignalFrame {
    this.recordFrame(frame);
    const processed = processTrackingSignalFrame(
      frame,
      this.activeProfile(),
      this.engineState,
      options,
    );
    this.diagnostics = processed.diagnostics;
    return processed.frame;
  }

  captureNeutral(source: TrackingSignalSource, frame = this.latestFrame(source)): boolean {
    if (!frame) return false;
    const profile = this.activeProfile();
    if (!profile) return false;
    const updated = cloneCalibrationProfile(profile);
    for (const [channel, value] of Object.entries(frame.channels)) {
      const channelId = makeTrackingChannelId(source, channel);
      updated.channels[channelId] = {
        ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
        enabled: false,
        ...(updated.channels[channelId] ?? {}),
        neutral: value,
      };
    }
    this.profiles.set(updated.id, updated);
    resetCalibrationEngineState(this.engineState);
    return true;
  }

  suggestRanges(source: TrackingSignalSource): boolean {
    const profile = this.activeProfile();
    if (!profile) return false;
    const ranges = [...this.observedRanges.values()].filter(
      (range) => range.source === source,
    );
    if (ranges.length === 0) return false;
    const updated = cloneCalibrationProfile(profile);
    for (const range of ranges) {
      const previous = {
        ...DEFAULT_TRACKING_CHANNEL_CALIBRATION,
        ...(updated.channels[range.channelId] ?? {}),
      };
      updated.channels[range.channelId] = suggestTrackingChannelCalibration(
        {
          min: range.min,
          max: range.max,
          neutral: previous.neutral,
        },
        previous,
      );
    }
    this.profiles.set(updated.id, updated);
    this.clearObservedRanges(source);
    resetCalibrationEngineState(this.engineState);
    return true;
  }

  private clearObservedRanges(source: TrackingSignalSource): void {
    const channelIds: string[] = [];
    for (const [channelId, range] of this.observedRanges) {
      if (range.source === source) channelIds.push(channelId);
    }
    for (const channelId of channelIds) {
      this.observedRanges.delete(channelId);
    }
  }

  private trimObservedRanges(): void {
    while (this.observedRanges.size > MAX_OBSERVED_CALIBRATION_RANGES) {
      const oldest = this.observedRanges.keys().next().value;
      if (!oldest) return;
      this.observedRanges.delete(oldest);
    }
  }

  private enrichedDiagnostics(): TrackingCalibrationDiagnostic[] {
    const now = Date.now();
    return this.diagnostics.map((diagnostic) => {
      const observed = this.observedRanges.get(diagnostic.channelId);
      const frame = this.latestFrames.get(diagnostic.source);
      return {
        ...diagnostic,
        observedMin: observed?.min,
        observedMax: observed?.max,
        stale: frame ? now - frame.timestamp > TRACKING_STALE_THRESHOLD_MS : true,
      };
    });
  }
}

export function makeTrackingFrameFromChannels(
  source: TrackingSignalSource,
  channels: Record<string, number>,
): TrackingSignalFrame {
  return createTrackingSignalFrame(source, channels);
}
