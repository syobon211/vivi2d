export const PLATFORM_FACE_CHANNEL_NAMES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export type PlatformFaceChannelName = (typeof PLATFORM_FACE_CHANNEL_NAMES)[number];

export type PlatformFaceTrackingMap = Partial<Record<PlatformFaceChannelName, string>>;

const INVERTED_FACE_CHANNELS = new Set<string>(["eyeBlinkLeft", "eyeBlinkRight"]);

export function faceChannelsToParams(
  faceChannels: Record<string, number>,
  mapping: PlatformFaceTrackingMap,
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [channelName, paramId] of Object.entries(mapping)) {
    if (!paramId) continue;
    const value = faceChannels[channelName];
    if (value === undefined) continue;
    params[paramId] = INVERTED_FACE_CHANNELS.has(channelName) ? 1 - value : value;
  }
  return params;
}

export function parseFaceCategoryScores(
  categories: Array<{ categoryName: string; score: number }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const cat of categories) {
    if (cat.categoryName === "_neutral") continue;
    result[cat.categoryName] = cat.score;
  }
  return result;
}

const PLATFORM_FACE_MATCHING_RULES: {
  key: PlatformFaceChannelName;
  patterns: RegExp[];
}[] = [
  { key: "browDownLeft", patterns: [/brow.*down.*l/i, /ParamBrowDownL/i, /左眉.*下/] },
  { key: "browDownRight", patterns: [/brow.*down.*r/i, /ParamBrowDownR/i, /右眉.*下/] },
  {
    key: "browInnerUp",
    patterns: [/brow.*inner.*up/i, /ParamBrowInnerUp/i, /眉.*内.*上/],
  },
  {
    key: "browOuterUpLeft",
    patterns: [/brow.*outer.*up.*l/i, /ParamBrowOuterUpL/i, /左眉.*外.*上/],
  },
  {
    key: "browOuterUpRight",
    patterns: [/brow.*outer.*up.*r/i, /ParamBrowOuterUpR/i, /右眉.*外.*上/],
  },
  { key: "cheekPuff", patterns: [/cheek.*puff/i, /ParamCheekPuff/i, /頬.*膨/] },
  {
    key: "cheekSquintLeft",
    patterns: [/cheek.*squint.*l/i, /ParamCheekSquintL/i, /左頬.*細/],
  },
  {
    key: "cheekSquintRight",
    patterns: [/cheek.*squint.*r/i, /ParamCheekSquintR/i, /右頬.*細/],
  },
  {
    key: "eyeBlinkLeft",
    patterns: [
      /eye.*blink.*l/i,
      /eye.*l.*open/i,
      /ParamEyeLOpen/i,
      /ParamEyeBlinkL/i,
      /左目.*開/,
      /左目.*閉/,
    ],
  },
  {
    key: "eyeBlinkRight",
    patterns: [
      /eye.*blink.*r/i,
      /eye.*r.*open/i,
      /ParamEyeROpen/i,
      /ParamEyeBlinkR/i,
      /右目.*開/,
      /右目.*閉/,
    ],
  },
  {
    key: "eyeLookDownLeft",
    patterns: [/eye.*look.*down.*l/i, /ParamEyeLookDownL/i, /左目.*下/],
  },
  {
    key: "eyeLookDownRight",
    patterns: [/eye.*look.*down.*r/i, /ParamEyeLookDownR/i, /右目.*下/],
  },
  {
    key: "eyeLookInLeft",
    patterns: [/eye.*look.*in.*l/i, /ParamEyeLookInL/i, /左目.*内/],
  },
  {
    key: "eyeLookInRight",
    patterns: [/eye.*look.*in.*r/i, /ParamEyeLookInR/i, /右目.*内/],
  },
  {
    key: "eyeLookOutLeft",
    patterns: [/eye.*look.*out.*l/i, /ParamEyeLookOutL/i, /左目.*外/],
  },
  {
    key: "eyeLookOutRight",
    patterns: [/eye.*look.*out.*r/i, /ParamEyeLookOutR/i, /右目.*外/],
  },
  {
    key: "eyeLookUpLeft",
    patterns: [/eye.*look.*up.*l/i, /ParamEyeLookUpL/i, /左目.*上/],
  },
  {
    key: "eyeLookUpRight",
    patterns: [/eye.*look.*up.*r/i, /ParamEyeLookUpR/i, /右目.*上/],
  },
  { key: "eyeSquintLeft", patterns: [/eye.*squint.*l/i, /ParamEyeSquintL/i, /左目.*細/] },
  {
    key: "eyeSquintRight",
    patterns: [/eye.*squint.*r/i, /ParamEyeSquintR/i, /右目.*細/],
  },
  { key: "eyeWideLeft", patterns: [/eye.*wide.*l/i, /ParamEyeWideL/i, /左目.*見開/] },
  { key: "eyeWideRight", patterns: [/eye.*wide.*r/i, /ParamEyeWideR/i, /右目.*見開/] },
  { key: "jawForward", patterns: [/jaw.*forward/i, /ParamJawForward/i, /顎.*前/] },
  { key: "jawLeft", patterns: [/jaw.*left/i, /ParamJawLeft/i, /顎.*左/] },
  {
    key: "jawOpen",
    patterns: [
      /jaw.*open/i,
      /mouth.*open/i,
      /ParamJawOpen/i,
      /ParamMouthOpenY/i,
      /口.*開/,
      /顎.*開/,
    ],
  },
  { key: "jawRight", patterns: [/jaw.*right/i, /ParamJawRight/i, /顎.*右/] },
  { key: "mouthClose", patterns: [/mouth.*close/i, /ParamMouthClose/i, /口.*閉/] },
  {
    key: "mouthDimpleLeft",
    patterns: [/mouth.*dimple.*l/i, /ParamMouthDimpleL/i, /左口.*えくぼ/],
  },
  {
    key: "mouthDimpleRight",
    patterns: [/mouth.*dimple.*r/i, /ParamMouthDimpleR/i, /右口.*えくぼ/],
  },
  {
    key: "mouthFrownLeft",
    patterns: [/mouth.*frown.*l/i, /ParamMouthFrownL/i, /左口.*下げ/],
  },
  {
    key: "mouthFrownRight",
    patterns: [/mouth.*frown.*r/i, /ParamMouthFrownR/i, /右口.*下げ/],
  },
  { key: "mouthFunnel", patterns: [/mouth.*funnel/i, /ParamMouthFunnel/i, /口.*すぼ/] },
  { key: "mouthLeft", patterns: [/^mouth.*left$/i, /ParamMouthLeft/i, /口.*左$/] },
  {
    key: "mouthLowerDownLeft",
    patterns: [/mouth.*lower.*down.*l/i, /ParamMouthLowerDownL/i, /下唇.*左.*下/],
  },
  {
    key: "mouthLowerDownRight",
    patterns: [/mouth.*lower.*down.*r/i, /ParamMouthLowerDownR/i, /下唇.*右.*下/],
  },
  {
    key: "mouthPressLeft",
    patterns: [/mouth.*press.*l/i, /ParamMouthPressL/i, /左口.*押/],
  },
  {
    key: "mouthPressRight",
    patterns: [/mouth.*press.*r/i, /ParamMouthPressR/i, /右口.*押/],
  },
  {
    key: "mouthPucker",
    patterns: [/mouth.*pucker/i, /ParamMouthPucker/i, /口.*尖/, /口.*すぼめ/],
  },
  { key: "mouthRight", patterns: [/^mouth.*right$/i, /ParamMouthRight/i, /口.*右$/] },
  {
    key: "mouthRollLower",
    patterns: [/mouth.*roll.*lower/i, /ParamMouthRollLower/i, /下唇.*巻/],
  },
  {
    key: "mouthRollUpper",
    patterns: [/mouth.*roll.*upper/i, /ParamMouthRollUpper/i, /上唇.*巻/],
  },
  {
    key: "mouthShrugLower",
    patterns: [/mouth.*shrug.*lower/i, /ParamMouthShrugLower/i, /下唇.*突/],
  },
  {
    key: "mouthShrugUpper",
    patterns: [/mouth.*shrug.*upper/i, /ParamMouthShrugUpper/i, /上唇.*突/],
  },
  {
    key: "mouthSmileLeft",
    patterns: [
      /mouth.*smile.*l/i,
      /mouth.*form/i,
      /ParamMouthSmileL/i,
      /ParamMouthForm/i,
      /左口.*笑/,
      /口.*幅/,
      /口.*形/,
    ],
  },
  {
    key: "mouthSmileRight",
    patterns: [/mouth.*smile.*r/i, /ParamMouthSmileR/i, /右口.*笑/],
  },
  {
    key: "mouthStretchLeft",
    patterns: [/mouth.*stretch.*l/i, /ParamMouthStretchL/i, /左口.*伸/],
  },
  {
    key: "mouthStretchRight",
    patterns: [/mouth.*stretch.*r/i, /ParamMouthStretchR/i, /右口.*伸/],
  },
  {
    key: "mouthUpperUpLeft",
    patterns: [/mouth.*upper.*up.*l/i, /ParamMouthUpperUpL/i, /上唇.*左.*上/],
  },
  {
    key: "mouthUpperUpRight",
    patterns: [/mouth.*upper.*up.*r/i, /ParamMouthUpperUpR/i, /上唇.*右.*上/],
  },
  {
    key: "noseSneerLeft",
    patterns: [/nose.*sneer.*l/i, /ParamNoseSneerL/i, /左鼻.*しわ/],
  },
  {
    key: "noseSneerRight",
    patterns: [/nose.*sneer.*r/i, /ParamNoseSneerR/i, /右鼻.*しわ/],
  },
  { key: "tongueOut", patterns: [/tongue.*out/i, /ParamTongueOut/i, /舌.*出/, /舌$/] },
];

export function autoDetectPlatformFaceMapping(
  parameters: readonly { id: string; name: string }[],
): PlatformFaceTrackingMap {
  const mapping: PlatformFaceTrackingMap = {};
  const usedIds = new Set<string>();

  for (const rule of PLATFORM_FACE_MATCHING_RULES) {
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
