import type { ParameterDefinition } from "@vivi2d/core/types";
import type { FaceTrackingResult, TrackingParameterMap } from "./face-mapper";
import type { HandTrackingParameterMap, HandTrackingResult } from "./hand-mapper";
import type { PoseTrackingParameterMap, PoseTrackingResult } from "./pose-mapper";

const MATCHING_RULES: {
  key: keyof FaceTrackingResult;
  patterns: RegExp[];
}[] = [
  {
    key: "eyeOpenLeft",
    patterns: [
      /eye.*l.*open/i,
      /left.*eye.*open/i,
      /l.*eye/i,
      /ParamEyeLOpen/i,
      /目.*左.*開/,
      /左目/,
    ],
  },
  {
    key: "eyeOpenRight",
    patterns: [
      /eye.*r.*open/i,
      /right.*eye.*open/i,
      /r.*eye/i,
      /ParamEyeROpen/i,
      /目.*右.*開/,
      /右目/,
    ],
  },
  {
    key: "mouthOpen",
    patterns: [/mouth.*open/i, /ParamMouthOpenY/i, /口.*開/, /口開閉/],
  },
  {
    key: "mouthWidth",
    patterns: [/mouth.*form/i, /mouth.*width/i, /ParamMouthForm/i, /口.*幅/, /口.*形/],
  },
  {
    key: "headRotationX",
    patterns: [/angle.*x/i, /head.*x/i, /ParamAngleX/i, /角度.*X/i, /首.*上下/],
  },
  {
    key: "headRotationY",
    patterns: [/angle.*y/i, /head.*y/i, /ParamAngleY/i, /角度.*Y/i, /首.*左右/],
  },
  {
    key: "headRotationZ",
    patterns: [/angle.*z/i, /head.*z/i, /ParamAngleZ/i, /角度.*Z/i, /首.*傾/],
  },
  {
    key: "browLeftY",
    patterns: [/brow.*l/i, /left.*brow/i, /ParamBrowLY/i, /眉.*左/, /左眉/],
  },
  {
    key: "browRightY",
    patterns: [/brow.*r/i, /right.*brow/i, /ParamBrowRY/i, /眉.*右/, /右眉/],
  },
];

export function autoDetectMapping(
  parameters: readonly ParameterDefinition[],
): TrackingParameterMap {
  const mapping: TrackingParameterMap = {};
  const usedIds = new Set<string>();

  for (const rule of MATCHING_RULES) {
    for (const pattern of rule.patterns) {
      let matched = false;
      for (const param of parameters) {
        if (usedIds.has(param.id)) continue;
        if (pattern.test(param.name) || pattern.test(param.id)) {
          mapping[rule.key] = param.id;
          usedIds.add(param.id);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return mapping;
}

const HAND_MATCHING_RULES: {
  key: keyof HandTrackingResult;
  patterns: RegExp[];
}[] = [
  {
    key: "handLX",
    patterns: [/hand.*l.*x/i, /left.*hand.*x/i, /ParamHandLX/i, /左手.*[Xx]/, /左手.*横/],
  },
  {
    key: "handLY",
    patterns: [/hand.*l.*y/i, /left.*hand.*y/i, /ParamHandLY/i, /左手.*[Yy]/, /左手.*縦/],
  },
  {
    key: "handLGrip",
    patterns: [/hand.*l.*grip/i, /left.*hand.*grip/i, /ParamHandLGrip/i, /左手.*握/],
  },
  {
    key: "handRX",
    patterns: [
      /hand.*r.*x/i,
      /right.*hand.*x/i,
      /ParamHandRX/i,
      /右手.*[Xx]/,
      /右手.*横/,
    ],
  },
  {
    key: "handRY",
    patterns: [
      /hand.*r.*y/i,
      /right.*hand.*y/i,
      /ParamHandRY/i,
      /右手.*[Yy]/,
      /右手.*縦/,
    ],
  },
  {
    key: "handRGrip",
    patterns: [/hand.*r.*grip/i, /right.*hand.*grip/i, /ParamHandRGrip/i, /右手.*握/],
  },
];

export function autoDetectHandMapping(
  parameters: readonly ParameterDefinition[],
): HandTrackingParameterMap {
  const mapping: HandTrackingParameterMap = {};
  const usedIds = new Set<string>();

  for (const rule of HAND_MATCHING_RULES) {
    for (const pattern of rule.patterns) {
      let matched = false;
      for (const param of parameters) {
        if (usedIds.has(param.id)) continue;
        if (pattern.test(param.name) || pattern.test(param.id)) {
          mapping[rule.key] = param.id;
          usedIds.add(param.id);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return mapping;
}

const POSE_MATCHING_RULES: {
  key: keyof PoseTrackingResult;
  patterns: RegExp[];
}[] = [
  {
    key: "bodyRotZ",
    patterns: [/body.*rot.*z/i, /body.*tilt/i, /ParamBodyRotZ/i, /体.*傾/, /胴体.*回転/],
  },
  {
    key: "armLRaise",
    patterns: [/arm.*l.*raise/i, /left.*arm.*raise/i, /ParamArmLRaise/i, /左腕.*上/],
  },
  {
    key: "armRRaise",
    patterns: [/arm.*r.*raise/i, /right.*arm.*raise/i, /ParamArmRRaise/i, /右腕.*上/],
  },
  {
    key: "armLBend",
    patterns: [
      /arm.*l.*bend/i,
      /left.*arm.*bend/i,
      /left.*elbow/i,
      /ParamArmLBend/i,
      /左肘/,
      /左腕.*曲/,
    ],
  },
  {
    key: "armRBend",
    patterns: [
      /arm.*r.*bend/i,
      /right.*arm.*bend/i,
      /right.*elbow/i,
      /ParamArmRBend/i,
      /右肘/,
      /右腕.*曲/,
    ],
  },
];

export function autoDetectPoseMapping(
  parameters: readonly ParameterDefinition[],
): PoseTrackingParameterMap {
  const mapping: PoseTrackingParameterMap = {};
  const usedIds = new Set<string>();

  for (const rule of POSE_MATCHING_RULES) {
    for (const pattern of rule.patterns) {
      let matched = false;
      for (const param of parameters) {
        if (usedIds.has(param.id)) continue;
        if (pattern.test(param.name) || pattern.test(param.id)) {
          mapping[rule.key] = param.id;
          usedIds.add(param.id);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return mapping;
}

export function getMappingSummary(
  mapping: TrackingParameterMap,
  parameters: readonly ParameterDefinition[],
): { key: string; label: string; paramName: string | null }[] {
  const labels: Record<keyof FaceTrackingResult, string> = {
    eyeOpenLeft: "Left Eye Open",
    eyeOpenRight: "Right Eye Open",
    mouthOpen: "Mouth Open",
    mouthWidth: "Mouth Width",
    headRotationX: "Head Up / Down",
    headRotationY: "Head Left / Right",
    headRotationZ: "Head Tilt",
    browLeftY: "Left Brow",
    browRightY: "Right Brow",
  };

  return Object.entries(labels).map(([key, label]) => {
    const paramId = mapping[key as keyof TrackingParameterMap];
    const param = paramId ? parameters.find((p) => p.id === paramId) : undefined;
    return {
      key,
      label,
      paramName: param?.name ?? null,
    };
  });
}
