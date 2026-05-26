import type { ImageSequenceTrack } from "./types";

export function evaluateImageSequenceAtFrame(
  track: ImageSequenceTrack,
  frame: number,
): string | null {
  const { entries } = track;
  if (entries.length === 0) return null;

  if (frame < entries[0]!.startFrame) return null;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (entries[mid]!.startFrame <= frame) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return entries[lo]!.imageId;
}

export function evaluateImageSequenceTracksAtFrame(
  tracks: ImageSequenceTrack[],
  frame: number,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const track of tracks) {
    const imageId = evaluateImageSequenceAtFrame(track, frame);
    if (imageId !== null) {
      result[track.targetMeshId] = imageId;
    }
  }
  return result;
}
