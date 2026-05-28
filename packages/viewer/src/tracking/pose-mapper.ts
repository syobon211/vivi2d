import type { PoseLandmark } from "./pose-tracker";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

export interface PoseTrackingResult {
  bodyRotZ: number;

  armLRaise: number;

  armRRaise: number;

  armLBend: number;

  armRBend: number;
}

export interface PoseTrackingParameterMap {
  bodyRotZ?: string;
  armLRaise?: string;
  armRRaise?: string;
  armLBend?: string;
  armRBend?: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist2D(a: PoseLandmark, b: PoseLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeArmRaise(shoulder: PoseLandmark, wrist: PoseLandmark): number {
  const dy = shoulder.y - wrist.y;
  return clamp(dy * 4, 0, 1);
}

function computeElbowBend(
  shoulder: PoseLandmark,
  elbow: PoseLandmark,
  wrist: PoseLandmark,
): number {
  const upperArm = dist2D(shoulder, elbow);
  const foreArm = dist2D(elbow, wrist);
  const direct = dist2D(shoulder, wrist);

  if (upperArm < 0.001 || foreArm < 0.001) return 0;

  const maxLen = upperArm + foreArm;
  const ratio = direct / maxLen;

  return clamp((1 - ratio) * 2, 0, 1);
}

export function defaultPoseResult(): PoseTrackingResult {
  return {
    bodyRotZ: 0,
    armLRaise: 0,
    armRRaise: 0,
    armLBend: 0,
    armRBend: 0,
  };
}

export function mapPoseLandmarksToParams(landmarks: PoseLandmark[]): PoseTrackingResult {
  if (landmarks.length < 25) return defaultPoseResult();

  const lShoulder = landmarks[LEFT_SHOULDER]!;
  const rShoulder = landmarks[RIGHT_SHOULDER]!;
  const lElbow = landmarks[LEFT_ELBOW]!;
  const rElbow = landmarks[RIGHT_ELBOW]!;
  const lWrist = landmarks[LEFT_WRIST]!;
  const rWrist = landmarks[RIGHT_WRIST]!;
  const _lHip = landmarks[LEFT_HIP]!;
  const _rHip = landmarks[RIGHT_HIP]!;

  const shoulderDy = lShoulder.y - rShoulder.y;
  const shoulderDx = Math.abs(lShoulder.x - rShoulder.x);
  const bodyRotZ = shoulderDx > 0.01 ? clamp((shoulderDy / shoulderDx) * 2, -1, 1) : 0;

  const armLRaise = computeArmRaise(lShoulder, lWrist);
  const armRRaise = computeArmRaise(rShoulder, rWrist);

  const armLBend = computeElbowBend(lShoulder, lElbow, lWrist);
  const armRBend = computeElbowBend(rShoulder, rElbow, rWrist);

  return { bodyRotZ, armLRaise, armRRaise, armLBend, armRBend };
}

export function poseTrackingResultToParams(
  result: PoseTrackingResult,
  mapping: PoseTrackingParameterMap,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [key, paramName] of Object.entries(mapping)) {
    if (!paramName) continue;
    const value = result[key as keyof PoseTrackingResult];
    if (value !== undefined) {
      params[paramName] = value;
    }
  }
  return params;
}
