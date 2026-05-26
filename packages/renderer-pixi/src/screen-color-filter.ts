import { Filter, GlProgram } from "pixi.js";

export interface ScreenRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aTextureCoord;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aTextureCoord;
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uScreenColor;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  color.rgb = color.rgb + uScreenColor * color.a * (1.0 - color.rgb);
  finalColor = color;
}
`;

const UNIFORM_GROUP = "screenColorUniforms";
const UNIFORM_NAME = "uScreenColor";

export function createScreenColorFilter(color: ScreenRgbColor): Filter {
  return new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "screen-color-filter",
    }),
    resources: {
      [UNIFORM_GROUP]: {
        [UNIFORM_NAME]: {
          value: new Float32Array([color.r, color.g, color.b]),
          type: "vec3<f32>",
        },
      },
    },
  });
}

export function updateScreenColorFilter(
  filter: Filter,
  color: ScreenRgbColor,
): void {
  const uniforms = filter.resources?.[UNIFORM_GROUP]?.uniforms as
    | Record<string, Float32Array | undefined>
    | undefined;
  const uniform = uniforms?.[UNIFORM_NAME];
  if (!uniform) return;
  uniform[0] = color.r;
  uniform[1] = color.g;
  uniform[2] = color.b;
}
