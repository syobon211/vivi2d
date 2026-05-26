import { CanvasTexture, ShaderMaterial, type Texture, Uniform, Vector3 } from "three";

export interface ScreenRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const VERTEX = /* glsl */ `
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec3 uScreenColor;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    vec3 screen = 1.0 - (1.0 - color.rgb) * (1.0 - uScreenColor);
    gl_FragColor = vec4(screen * color.a, color.a);
  }
`;

export function createScreenColorMaterial(
  texture: Texture,
  screenColor: ScreenRgbColor,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTexture: new Uniform(texture),
      uScreenColor: new Uniform(new Vector3(screenColor.r, screenColor.g, screenColor.b)),
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

export function updateScreenColorMaterial(
  material: ShaderMaterial,
  screenColor: ScreenRgbColor,
): void {
  const u = material.uniforms.uScreenColor;
  if (u) {
    (u.value as Vector3).set(screenColor.r, screenColor.g, screenColor.b);
  }
}

export function canvasToThreeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  return tex;
}
