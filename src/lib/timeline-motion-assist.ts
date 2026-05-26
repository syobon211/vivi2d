import type {
  AnimationClip,
  ParameterDefinition,
  ProjectData,
  TimelineKeyframe,
} from "@vivi2d/core/types";

export interface MotionAssistSample {
  frame: number;
  value: number;
}

export interface MotionAssistChannel {
  id: string;
  name: string;
  samples: MotionAssistSample[];
}

export interface MotionAssistBundle {
  schemaVersion: "1.0.0";
  fps: number;
  durationFrames: number;
  channels: MotionAssistChannel[];
}

export type MotionAssistMatchSource =
  | "exactId"
  | "exactName"
  | "ambiguous"
  | "unmapped"
  | "manual";

export interface MotionAssistChannelMapping {
  channelId: string;
  channelLabel: string;
  enabled: boolean;
  parameterId: string | null;
  scale: number;
  offset: number;
  matchSource: MotionAssistMatchSource;
}

export interface MotionAssistTrackWrite {
  parameterId: string;
  label: string;
  sourceChannelLabel: string;
  keyframes: TimelineKeyframe[];
  rangeStart: number;
  rangeEnd: number;
  hadOverlap: boolean;
}

export interface MotionAssistImportPlan {
  targetStartFrame: number;
  writes: MotionAssistTrackWrite[];
  warnings: string[];
  unmappedChannelLabels: string[];
  conflictingChannelLabels: string[];
  emptyChannelLabels: string[];
}

export interface MotionAssistImportInput {
  targetStartFrame: number;
  mappings: MotionAssistChannelMapping[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeString(value: string): string {
  return value.trim();
}

function clampRange(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function normalizeSourceSamples(
  rawSamples: unknown,
  durationFrames: number,
  channelLabel: string,
): MotionAssistSample[] {
  if (!Array.isArray(rawSamples)) {
    throw new Error(`Channel "${channelLabel}" samples must be an array.`);
  }
  const lastByFrame = new Map<number, MotionAssistSample>();
  for (const rawSample of rawSamples) {
    if (!isRecord(rawSample)) {
      throw new Error(`Channel "${channelLabel}" contains an invalid sample entry.`);
    }
    const frame = asFiniteNumber(rawSample.frame);
    const value = asFiniteNumber(rawSample.value);
    if (frame === null || value === null) {
      throw new Error(`Channel "${channelLabel}" contains a non-finite sample.`);
    }
    const normalizedFrame = Math.round(frame);
    if (normalizedFrame < 0 || normalizedFrame >= durationFrames) {
      throw new Error(
        `Channel "${channelLabel}" sample frame ${normalizedFrame} is outside the bundle duration.`,
      );
    }
    lastByFrame.set(normalizedFrame, {
      frame: normalizedFrame,
      value,
    });
  }
  return [...lastByFrame.values()].sort((left, right) => left.frame - right.frame);
}

export function parseMotionAssistBundle(json: string): MotionAssistBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Motion Assist bundle is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Motion Assist bundle must be a JSON object.");
  }
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error("Motion Assist bundle schemaVersion must be 1.0.0.");
  }

  const fps = asFiniteNumber(parsed.fps);
  const durationFrames = asFiniteNumber(parsed.durationFrames);
  if (fps === null || fps <= 0) {
    throw new Error("Motion Assist bundle fps must be a positive number.");
  }
  if (durationFrames === null || durationFrames <= 0) {
    throw new Error("Motion Assist bundle durationFrames must be a positive number.");
  }
  if (!Array.isArray(parsed.channels)) {
    throw new Error("Motion Assist bundle channels must be an array.");
  }

  const channels: MotionAssistChannel[] = parsed.channels.map((rawChannel, index) => {
    if (!isRecord(rawChannel)) {
      throw new Error(`Channel ${index} is not a valid object.`);
    }
    const id = typeof rawChannel.id === "string" ? normalizeString(rawChannel.id) : "";
    const name =
      typeof rawChannel.name === "string" ? normalizeString(rawChannel.name) : "";
    if (!id) {
      throw new Error(`Channel ${index} is missing a valid id.`);
    }
    if (!name) {
      throw new Error(`Channel "${id}" is missing a valid name.`);
    }
    return {
      id,
      name,
      samples: normalizeSourceSamples(
        rawChannel.samples,
        Math.round(durationFrames),
        name,
      ),
    };
  });

  return {
    schemaVersion: "1.0.0",
    fps,
    durationFrames: Math.round(durationFrames),
    channels,
  };
}

function autoMatchChannel(
  parameters: readonly ParameterDefinition[],
  channel: MotionAssistChannel,
): MotionAssistChannelMapping {
  const idMatches = parameters.filter((parameter) => parameter.id === channel.id);
  if (idMatches.length === 1) {
    return {
      channelId: channel.id,
      channelLabel: channel.name,
      enabled: true,
      parameterId: idMatches[0]!.id,
      scale: 1,
      offset: 0,
      matchSource: "exactId",
    };
  }

  const nameMatches = parameters.filter((parameter) => parameter.name === channel.name);
  if (nameMatches.length === 1) {
    return {
      channelId: channel.id,
      channelLabel: channel.name,
      enabled: true,
      parameterId: nameMatches[0]!.id,
      scale: 1,
      offset: 0,
      matchSource: "exactName",
    };
  }

  if (nameMatches.length > 1) {
    return {
      channelId: channel.id,
      channelLabel: channel.name,
      enabled: true,
      parameterId: null,
      scale: 1,
      offset: 0,
      matchSource: "ambiguous",
    };
  }

  return {
    channelId: channel.id,
    channelLabel: channel.name,
    enabled: true,
    parameterId: null,
    scale: 1,
    offset: 0,
    matchSource: "unmapped",
  };
}

export function createMotionAssistAutoMappings(
  project: ProjectData,
  bundle: MotionAssistBundle,
): MotionAssistChannelMapping[] {
  const mappings = bundle.channels.map((channel) =>
    autoMatchChannel(project.parameters, channel),
  );

  const autoGroups = new Map<string, number[]>();
  mappings.forEach((mapping, index) => {
    if (
      mapping.parameterId &&
      (mapping.matchSource === "exactId" || mapping.matchSource === "exactName")
    ) {
      const indices = autoGroups.get(mapping.parameterId);
      if (indices) {
        indices.push(index);
      } else {
        autoGroups.set(mapping.parameterId, [index]);
      }
    }
  });

  for (const indices of autoGroups.values()) {
    if (indices.length < 2) continue;
    for (const index of indices) {
      mappings[index] = {
        ...mappings[index]!,
        parameterId: null,
        matchSource: "ambiguous",
      };
    }
  }

  return mappings;
}

function collectOverlapFrames(
  clip: AnimationClip,
  parameterId: string,
  startFrame: number,
  endFrame: number,
): number[] {
  return (
    clip.tracks
      .find((track) => track.parameterId === parameterId)
      ?.keyframes.filter(
        (keyframe) => keyframe.frame >= startFrame && keyframe.frame <= endFrame,
      )
      .map((keyframe) => keyframe.frame) ?? []
  );
}

export function planMotionAssistImport(
  project: ProjectData,
  clip: AnimationClip,
  bundle: MotionAssistBundle,
  input: MotionAssistImportInput,
): MotionAssistImportPlan {
  const warnings: string[] = [];
  const unmappedChannelLabels: string[] = [];
  const conflictingChannelLabels: string[] = [];
  const emptyChannelLabels: string[] = [];

  const clipEnd = Math.max(0, clip.duration - 1);
  const targetStartFrame = Math.max(0, Math.round(input.targetStartFrame));
  if (clip.duration <= 0) {
    warnings.push("Target clip has no valid frames.");
    return {
      targetStartFrame,
      writes: [],
      warnings,
      unmappedChannelLabels,
      conflictingChannelLabels,
      emptyChannelLabels,
    };
  }

  const channelById = new Map(bundle.channels.map((channel) => [channel.id, channel]));
  const duplicateParameterIds = new Set<string>();
  const mappedCounts = new Map<string, number>();
  for (const mapping of input.mappings) {
    if (!mapping.enabled || !mapping.parameterId) continue;
    mappedCounts.set(
      mapping.parameterId,
      (mappedCounts.get(mapping.parameterId) ?? 0) + 1,
    );
  }
  for (const [parameterId, count] of mappedCounts.entries()) {
    if (count > 1) duplicateParameterIds.add(parameterId);
  }

  const writes: MotionAssistTrackWrite[] = [];
  for (const mapping of input.mappings) {
    if (!mapping.enabled) continue;
    const channel = channelById.get(mapping.channelId);
    if (!channel) continue;

    if (!mapping.parameterId) {
      if (mapping.matchSource === "ambiguous") {
        conflictingChannelLabels.push(channel.name);
      } else {
        unmappedChannelLabels.push(channel.name);
      }
      continue;
    }

    if (duplicateParameterIds.has(mapping.parameterId)) {
      conflictingChannelLabels.push(channel.name);
      continue;
    }

    const parameter = project.parameters.find(
      (entry) => entry.id === mapping.parameterId,
    );
    if (!parameter) {
      unmappedChannelLabels.push(channel.name);
      continue;
    }

    const keyframesByFrame = new Map<number, TimelineKeyframe>();
    for (const sample of channel.samples) {
      const destFrame =
        targetStartFrame + Math.round((sample.frame / bundle.fps) * clip.fps);
      if (destFrame < 0 || destFrame > clipEnd) continue;

      const mappedValue = sample.value * mapping.scale + mapping.offset;
      if (!Number.isFinite(mappedValue)) continue;

      keyframesByFrame.set(destFrame, {
        frame: destFrame,
        value: clampRange(mappedValue, parameter.minValue, parameter.maxValue),
        interpolation: "linear",
      });
    }

    const keyframes = [...keyframesByFrame.values()].sort(
      (left, right) => left.frame - right.frame,
    );
    if (keyframes.length === 0) {
      emptyChannelLabels.push(channel.name);
      continue;
    }

    const rangeStart = keyframes[0]!.frame;
    const rangeEnd = keyframes[keyframes.length - 1]!.frame;
    const overlapFrames = collectOverlapFrames(clip, parameter.id, rangeStart, rangeEnd);
    if (overlapFrames.length > 0) {
      warnings.push(
        `${parameter.name} has destination keys in frames ${rangeStart}-${rangeEnd} and will be overwritten.`,
      );
    }

    writes.push({
      parameterId: parameter.id,
      label: parameter.name,
      sourceChannelLabel: channel.name,
      keyframes,
      rangeStart,
      rangeEnd,
      hadOverlap: overlapFrames.length > 0,
    });
  }

  if (conflictingChannelLabels.length > 0) {
    warnings.push(
      `Skipped ${conflictingChannelLabels.length} channel(s) with conflicting parameter mappings.`,
    );
  }
  if (unmappedChannelLabels.length > 0) {
    warnings.push(`Skipped ${unmappedChannelLabels.length} unmapped channel(s).`);
  }
  if (emptyChannelLabels.length > 0) {
    warnings.push(
      `Skipped ${emptyChannelLabels.length} channel(s) with no projected destination samples.`,
    );
  }

  return {
    targetStartFrame,
    writes,
    warnings,
    unmappedChannelLabels,
    conflictingChannelLabels,
    emptyChannelLabels,
  };
}
