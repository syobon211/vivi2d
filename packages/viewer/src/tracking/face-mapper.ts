export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceTrackingResult {
  eyeOpenLeft: number;
  eyeOpenRight: number;

  mouthOpen: number;

  mouthWidth: number;

  headRotationX: number;
  headRotationY: number;
  headRotationZ: number;

  browLeftY: number;
  browRightY: number;
}

function getLm(landmarks: Landmark[], index: number): Landmark {
  const lm = landmarks[index];
  if (lm === undefined) {
    throw new Error(
      `FaceTracking: landmark index ${index} out of bounds (length=${landmarks.length})`,
    );
  }
  return lm;
}

const LM = {
  LEFT_EYE_UPPER: 159,
  LEFT_EYE_LOWER: 145,
  RIGHT_EYE_UPPER: 386,
  RIGHT_EYE_LOWER: 374,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  MOUTH_UPPER: 13,
  MOUTH_LOWER: 14,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  NOSE_TIP: 1,
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_BROW: 105,
  RIGHT_BROW: 334,
  FACE_LEFT: 234,
  FACE_RIGHT: 454,
} as const;

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function mapLandmarksToParams(landmarks: Landmark[]): FaceTrackingResult {
  const faceHeight = dist(getLm(landmarks, LM.FOREHEAD), getLm(landmarks, LM.CHIN));
  if (faceHeight < 0.001) {
    return defaultResult();
  }

  const leftEyeOpen = computeEyeOpen(
    getLm(landmarks, LM.LEFT_EYE_UPPER),
    getLm(landmarks, LM.LEFT_EYE_LOWER),
    getLm(landmarks, LM.LEFT_EYE_OUTER),
    getLm(landmarks, LM.LEFT_EYE_INNER),
  );
  const rightEyeOpen = computeEyeOpen(
    getLm(landmarks, LM.RIGHT_EYE_UPPER),
    getLm(landmarks, LM.RIGHT_EYE_LOWER),
    getLm(landmarks, LM.RIGHT_EYE_OUTER),
    getLm(landmarks, LM.RIGHT_EYE_INNER),
  );

  const mouthOpenDist = dist(
    getLm(landmarks, LM.MOUTH_UPPER),
    getLm(landmarks, LM.MOUTH_LOWER),
  );
  const mouthWidthDist = dist(
    getLm(landmarks, LM.MOUTH_LEFT),
    getLm(landmarks, LM.MOUTH_RIGHT),
  );
  const mouthOpen = clamp((mouthOpenDist / faceHeight) * 8, 0, 1);
  const mouthWidth = clamp((mouthWidthDist / faceHeight) * 3 - 0.5, 0, 1);

  const noseTip = getLm(landmarks, LM.NOSE_TIP);
  const forehead = getLm(landmarks, LM.FOREHEAD);
  const chin = getLm(landmarks, LM.CHIN);
  const faceLeft = getLm(landmarks, LM.FACE_LEFT);
  const faceRight = getLm(landmarks, LM.FACE_RIGHT);

  const faceCenterX = (faceLeft.x + faceRight.x) / 2;
  const faceWidth = dist(faceLeft, faceRight);
  const headRotationY =
    faceWidth > 0.001
      ? clamp(((noseTip.x - faceCenterX) / faceWidth) * 4, -1, 1) * 0.5
      : 0;

  const noseToForehead = dist(noseTip, forehead);
  const noseToChin = dist(noseTip, chin);
  const verticalRatio = noseToForehead / (noseToForehead + noseToChin);
  const headRotationX = clamp((verticalRatio - 0.4) * 4, -1, 1) * 0.3;

  const leftEye = getLm(landmarks, LM.LEFT_EYE_OUTER);
  const rightEye = getLm(landmarks, LM.RIGHT_EYE_OUTER);
  const headRotationZ = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

  const leftBrow = getLm(landmarks, LM.LEFT_BROW);
  const rightBrow = getLm(landmarks, LM.RIGHT_BROW);
  const leftEyeCenter = getLm(landmarks, LM.LEFT_EYE_UPPER);
  const rightEyeCenter = getLm(landmarks, LM.RIGHT_EYE_UPPER);
  const browLeftY = clamp(
    ((leftEyeCenter.y - leftBrow.y) / faceHeight) * 10 - 0.5,
    -1,
    1,
  );
  const browRightY = clamp(
    ((rightEyeCenter.y - rightBrow.y) / faceHeight) * 10 - 0.5,
    -1,
    1,
  );

  return {
    eyeOpenLeft: leftEyeOpen,
    eyeOpenRight: rightEyeOpen,
    mouthOpen,
    mouthWidth,
    headRotationX,
    headRotationY,
    headRotationZ,
    browLeftY,
    browRightY,
  };
}

function computeEyeOpen(
  upper: Landmark,
  lower: Landmark,
  outer: Landmark,
  inner: Landmark,
): number {
  const eyeHeight = dist(upper, lower);
  const eyeWidth = dist(outer, inner);
  if (eyeWidth < 0.001) return 1;
  const ratio = eyeHeight / eyeWidth;
  return clamp((ratio - 0.05) / 0.2, 0, 1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function defaultResult(): FaceTrackingResult {
  return {
    eyeOpenLeft: 1,
    eyeOpenRight: 1,
    mouthOpen: 0,
    mouthWidth: 0.5,
    headRotationX: 0,
    headRotationY: 0,
    headRotationZ: 0,
    browLeftY: 0,
    browRightY: 0,
  };
}

export interface TrackingParameterMap {
  eyeOpenLeft?: string;
  eyeOpenRight?: string;
  mouthOpen?: string;
  mouthWidth?: string;
  headRotationX?: string;
  headRotationY?: string;
  headRotationZ?: string;
  browLeftY?: string;
  browRightY?: string;
}

export const DEFAULT_TRACKING_MAP: TrackingParameterMap = {
  eyeOpenLeft: "vivi.eye.leftOpen",
  eyeOpenRight: "vivi.eye.rightOpen",
  mouthOpen: "vivi.mouth.open",
  mouthWidth: "vivi.mouth.width",
  headRotationX: "vivi.head.pitch",
  headRotationY: "vivi.head.yaw",
  headRotationZ: "vivi.head.roll",
  browLeftY: "vivi.brow.leftY",
  browRightY: "vivi.brow.rightY",
};

export function trackingResultToParams(
  result: FaceTrackingResult,
  mapping: TrackingParameterMap = DEFAULT_TRACKING_MAP,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [key, paramName] of Object.entries(mapping)) {
    if (!paramName) continue;
    const value = result[key as keyof FaceTrackingResult];
    if (value !== undefined) {
      params[paramName] = value;
    }
  }
  return params;
}
