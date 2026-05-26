import { describe, expect, it } from "vitest";
import {
  PLATFORM_FACE_CHANNEL_NAMES,
  autoDetectPlatformFaceMapping,
  faceChannelsToParams,
  parseFaceCategoryScores,
} from "../tracking/platform-face-channels";

describe("PLATFORM_FACE_CHANNEL_NAMES", () => {
  it("contains the expected canonical channel list", () => {
    expect(PLATFORM_FACE_CHANNEL_NAMES).toHaveLength(52);
    expect(PLATFORM_FACE_CHANNEL_NAMES[0]).toBe("browDownLeft");
    expect(PLATFORM_FACE_CHANNEL_NAMES[51]).toBe("tongueOut");
    expect(new Set(PLATFORM_FACE_CHANNEL_NAMES).size).toBe(
      PLATFORM_FACE_CHANNEL_NAMES.length,
    );
  });
});

describe("faceChannelsToParams", () => {
  it("maps platform face channels to Vivi2D parameters", () => {
    expect(
      faceChannelsToParams(
        { jawOpen: 0.6, mouthSmileLeft: 0.3 },
        {
          jawOpen: "ParamMouthOpenY",
          mouthSmileLeft: "ParamMouthSmileL",
        },
      ),
    ).toEqual({
      ParamMouthOpenY: 0.6,
      ParamMouthSmileL: 0.3,
    });
  });

  it("inverts blink channels for open-eye parameters", () => {
    expect(
      faceChannelsToParams(
        { eyeBlinkLeft: 0.8, eyeBlinkRight: 0 },
        {
          eyeBlinkLeft: "ParamEyeLOpen",
          eyeBlinkRight: "ParamEyeROpen",
        },
      ),
    ).toEqual({
      ParamEyeLOpen: 0.19999999999999996,
      ParamEyeROpen: 1,
    });
  });

  it("skips empty mappings and missing input channels", () => {
    expect(
      faceChannelsToParams({ jawOpen: 0.5 }, { jawOpen: "", tongueOut: "Tongue" }),
    ).toEqual({});
  });
});

describe("parseFaceCategoryScores", () => {
  it("converts categories and skips neutral", () => {
    expect(
      parseFaceCategoryScores([
        { categoryName: "_neutral", score: 0.9 },
        { categoryName: "jawOpen", score: 0.4 },
        { categoryName: "tongueOut", score: 0 },
      ]),
    ).toEqual({ jawOpen: 0.4, tongueOut: 0 });
  });
});

describe("autoDetectPlatformFaceMapping", () => {
  it("detects common parameter ids and names", () => {
    const mapping = autoDetectPlatformFaceMapping([
      { id: "ParamEyeLOpen", name: "left eye open" },
      { id: "ParamEyeROpen", name: "right eye open" },
      { id: "ParamMouthOpenY", name: "mouth open" },
      { id: "ParamMouthForm", name: "mouth form" },
      { id: "ParamCheekPuff", name: "cheek puff" },
      { id: "ParamTongueOut", name: "tongue out" },
      { id: "ParamBrowDownL", name: "brow down left" },
      { id: "ParamBrowDownR", name: "brow down right" },
    ]);

    expect(mapping.eyeBlinkLeft).toBe("ParamEyeLOpen");
    expect(mapping.eyeBlinkRight).toBe("ParamEyeROpen");
    expect(mapping.jawOpen).toBe("ParamMouthOpenY");
    expect(mapping.mouthSmileLeft).toBe("ParamMouthForm");
    expect(mapping.cheekPuff).toBe("ParamCheekPuff");
    expect(mapping.tongueOut).toBe("ParamTongueOut");
    expect(mapping.browDownLeft).toBe("ParamBrowDownL");
    expect(mapping.browDownRight).toBe("ParamBrowDownR");
  });

  it("does not map one parameter id to multiple channels", () => {
    const mapping = autoDetectPlatformFaceMapping([
      { id: "ParamMouthForm", name: "mouth form" },
    ]);
    const matchedKeys = Object.entries(mapping)
      .filter(([, value]) => value === "ParamMouthForm")
      .map(([key]) => key);

    expect(matchedKeys).toEqual(["mouthSmileLeft"]);
  });

  it("returns an empty mapping when nothing matches", () => {
    expect(
      autoDetectPlatformFaceMapping([{ id: "ParamUnknown", name: "custom" }]),
    ).toEqual({});
    expect(autoDetectPlatformFaceMapping([])).toEqual({});
  });
});
