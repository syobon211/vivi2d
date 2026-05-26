import type { HandDetection, HandLandmark } from "./hand-tracker";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;

export interface HandTrackingResult {
  handLX: number;

  handLY: number;

  handLGrip: number;

  handRX: number;

  handRY: number;

  handRGrip: number;
}

export interface HandTrackingParameterMap {
  handLX?: string;
  handLY?: string;
  handLGrip?: string;
  handRX?: string;
  handRY?: string;
  handRGrip?: string;
}

function dist(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const REQUIRED_LANDMARKS = 21;

function computeHandParams(landmarks: HandLandmark[]): {
  x: number;
  y: number;
  grip: number;
} {
  if (landmarks.length < REQUIRED_LANDMARKS) {
    return { x: 0, y: 0, grip: 0 };
  }
  const wrist = landmarks[WRIST]!;

  const x = (wrist.x - 0.5) * 2;
  const y = -(wrist.y - 0.5) * 2;

  const palmSize = dist(landmarks[WRIST]!, landmarks[MIDDLE_MCP]!);
  if (palmSize < 0.001) return { x, y, grip: 0 };

  const tips = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
  const avgTipDist =
    tips.reduce((sum, i) => sum + dist(landmarks[i]!, landmarks[WRIST]!), 0) /
    tips.length;

  const ratio = avgTipDist / palmSize;
  const grip = clamp(1 - (ratio - 1.0) / 1.8, 0, 1);

  return { x, y, grip };
}

export function defaultHandResult(): HandTrackingResult {
  return {
    handLX: 0,
    handLY: 0,
    handLGrip: 0,
    handRX: 0,
    handRY: 0,
    handRGrip: 0,
  };
}

export function mapHandDetectionsToParams(hands: HandDetection[]): HandTrackingResult {
  const result = defaultHandResult();

  for (const hand of hands) {
    const params = computeHandParams(hand.landmarks);
    if (hand.handedness === "Left") {
      result.handRX = params.x;
      result.handRY = params.y;
      result.handRGrip = params.grip;
    } else {
      result.handLX = params.x;
      result.handLY = params.y;
      result.handLGrip = params.grip;
    }
  }

  return result;
}

export function handTrackingResultToParams(
  result: HandTrackingResult,
  mapping: HandTrackingParameterMap,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [key, paramName] of Object.entries(mapping)) {
    if (!paramName) continue;
    const value = result[key as keyof HandTrackingResult];
    if (value !== undefined) {
      params[paramName] = value;
    }
  }
  return params;
}
