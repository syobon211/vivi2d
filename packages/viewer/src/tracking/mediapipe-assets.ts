export const MEDIAPIPE_TASKS_VERSION = "0.10.35";

const LOCAL_ASSET_ROOT = `/vendor/mediapipe/tasks-vision-${MEDIAPIPE_TASKS_VERSION}`;

export const MEDIAPIPE_MODEL_ASSET_PATHS = {
  face: `${LOCAL_ASSET_ROOT}/models/face_landmarker.task`,
  hand: `${LOCAL_ASSET_ROOT}/models/hand_landmarker.task`,
  pose: `${LOCAL_ASSET_ROOT}/models/pose_landmarker_lite.task`,
} as const;

export const MEDIAPIPE_WASM_URL = `${LOCAL_ASSET_ROOT}/wasm`;

export const MEDIAPIPE_ASSET_POLICY = "same-origin-vendored-assets";
