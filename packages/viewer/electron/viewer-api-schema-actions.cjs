const RESERVED_CALIBRATION_CHANNEL_ID_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const ACTION_KINDS = [
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
];

const ACTION_KIND_SET = new Set(ACTION_KINDS);
const RESERVED_PUBLIC_ACTION_KINDS = new Set([
  "recordingControl",
  "scriptCommand",
  "bridgeCommand",
]);

module.exports = {
  ACTION_KIND_SET,
  ACTION_KINDS,
  RESERVED_CALIBRATION_CHANNEL_ID_SEGMENTS,
  RESERVED_PUBLIC_ACTION_KINDS,
};
