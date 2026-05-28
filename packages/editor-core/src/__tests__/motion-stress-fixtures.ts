import type {
  MotionStressAlphaView,
  MotionStressImageView,
  MotionStressPreviewInput,
  MotionStressRoleBucket,
} from "../motion-stress-diagnostics";

type RgbaPixel = readonly [number, number, number, number];

export type MotionStressFixtureName =
  | "hairOverFaceDuplicateLine"
  | "tailOverTransparentBackground"
  | "frontHairNearEye"
  | "frontHairNearEyeChanged"
  | "lowerOutlineFarFromMotion"
  | "opaqueBackgroundReveal"
  | "underpaintAlphaBelowThreshold"
  | "acceptedUnderpaintCoversReveal"
  | "noMotionRest";

export interface MotionStressFixture {
  name: MotionStressFixtureName;
  roleBucket: MotionStressRoleBucket;
  input: MotionStressPreviewInput;
}

const FIXTURE_WIDTH = 16;
const FIXTURE_HEIGHT = 16;

export function createMotionStressFixture(
  name: MotionStressFixtureName,
): MotionStressFixture {
  switch (name) {
    case "hairOverFaceDuplicateLine":
      return {
        name,
        roleBucket: "hair",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          duplicateContour: {
            movingAlpha: createAlpha([{ x: 4, y: 2, width: 3, height: 10, value: 255 }]),
            lowerAlpha: createAlpha([{ x: 4, y: 2, width: 3, height: 10, value: 255 }]),
            sourceComposite: createRgba(),
            previewComposite: createRgba(),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            searchRadiusPx: 1,
            minEdgeAlphaDelta: 64,
          },
          roleBucket: "hair",
        },
      };
    case "tailOverTransparentBackground":
      return {
        name,
        roleBucket: "tail",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          hiddenReveal: {
            movingAlphaBefore: createAlpha([{ x: 9, y: 2, width: 2, height: 10, value: 255 }]),
            movingAlphaAfter: createAlpha(),
            lowerAlpha: createAlpha(),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            minRevealAlphaDrop: 64,
          },
          roleBucket: "tail",
        },
      };
    case "frontHairNearEye":
      return {
        name,
        roleBucket: "hair",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          protectedCrops: [{ id: "eye", bounds: { x: 6, y: 6, width: 4, height: 3 } }],
          roleBucket: "hair",
        },
      };
    case "frontHairNearEyeChanged":
      return {
        name,
        roleBucket: "hair",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba([
            { x: 6, y: 6, width: 4, height: 3, value: [255, 96, 96, 255] },
          ]),
          protectedCrops: [{ id: "eye", bounds: { x: 6, y: 6, width: 4, height: 3 } }],
          roleBucket: "hair",
        },
      };
    case "lowerOutlineFarFromMotion":
      return {
        name,
        roleBucket: "hair",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          duplicateContour: {
            movingAlpha: createAlpha([{ x: 2, y: 2, width: 2, height: 8, value: 255 }]),
            lowerAlpha: createAlpha([{ x: 12, y: 2, width: 2, height: 8, value: 255 }]),
            sourceComposite: createRgba(),
            previewComposite: createRgba(),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            searchRadiusPx: 1,
            minEdgeAlphaDelta: 64,
          },
          roleBucket: "hair",
        },
      };
    case "opaqueBackgroundReveal":
      return {
        name,
        roleBucket: "tail",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          hiddenReveal: {
            movingAlphaBefore: createAlpha([{ x: 9, y: 2, width: 2, height: 10, value: 255 }]),
            movingAlphaAfter: createAlpha(),
            lowerAlpha: createAlpha([{ x: 9, y: 2, width: 2, height: 10, value: 255 }]),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            minRevealAlphaDrop: 64,
          },
          roleBucket: "tail",
        },
      };
    case "underpaintAlphaBelowThreshold":
      return {
        name,
        roleBucket: "tail",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          hiddenReveal: {
            movingAlphaBefore: createAlpha([{ x: 9, y: 2, width: 2, height: 10, value: 255 }]),
            movingAlphaAfter: createAlpha(),
            lowerAlpha: createAlpha(),
            acceptedUnderpaintAlpha: createAlpha([
              { x: 9, y: 2, width: 2, height: 10, value: 80 },
            ]),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            minRevealAlphaDrop: 64,
          },
          roleBucket: "tail",
        },
      };
    case "acceptedUnderpaintCoversReveal":
      return {
        name,
        roleBucket: "tail",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          hiddenReveal: {
            movingAlphaBefore: createAlpha([{ x: 9, y: 2, width: 2, height: 10, value: 255 }]),
            movingAlphaAfter: createAlpha(),
            lowerAlpha: createAlpha(),
            acceptedUnderpaintAlpha: createAlpha([
              { x: 9, y: 2, width: 2, height: 10, value: 255 },
            ]),
            width: FIXTURE_WIDTH,
            height: FIXTURE_HEIGHT,
            minRevealAlphaDrop: 64,
          },
          roleBucket: "tail",
        },
      };
    case "noMotionRest":
      return {
        name,
        roleBucket: "body",
        input: {
          regionId: name,
          sourceComposite: createRgba(),
          previewComposite: createRgba(),
          roleBucket: "body",
        },
      };
  }
}

function createRgba(
  rects: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    value: RgbaPixel;
  }[] = [],
): MotionStressImageView {
  const rgba = new Uint8ClampedArray(FIXTURE_WIDTH * FIXTURE_HEIGHT * 4);
  for (let index = 0; index < FIXTURE_WIDTH * FIXTURE_HEIGHT; index += 1) {
    rgba.set([64, 80, 64, 255], index * 4);
  }
  for (const rect of rects) {
    forEachRectPixel(rect, (index) => {
      rgba.set(rect.value, index * 4);
    });
  }
  return {
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    rgba,
    colorSpace: "srgb",
    alphaMode: "straight",
    normalizationVersion: 1,
  };
}

function createAlpha(
  rects: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  }[] = [],
): MotionStressAlphaView {
  const alpha = new Uint8ClampedArray(FIXTURE_WIDTH * FIXTURE_HEIGHT);
  for (const rect of rects) {
    forEachRectPixel(rect, (index) => {
      alpha[index] = rect.value;
    });
  }
  return {
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    alpha,
    normalizationVersion: 1,
  };
}

function forEachRectPixel(
  rect: { x: number; y: number; width: number; height: number },
  visit: (index: number) => void,
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x < 0 || y < 0 || x >= FIXTURE_WIDTH || y >= FIXTURE_HEIGHT) continue;
      visit(y * FIXTURE_WIDTH + x);
    }
  }
}
