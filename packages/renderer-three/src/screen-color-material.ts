import { CanvasTexture, ShaderMaterial, type Texture, Uniform, Vector3 } from "three";

export interface ScreenRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec3 uScreenColor;
  uniform vec3 uMultiplyColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    vec3 multiplied = color.rgb * uMultiplyColor;
    vec3 screen = 1.0 - (1.0 - multiplied) * (1.0 - uScreenColor);
    gl_FragColor = vec4(screen, color.a * uOpacity);
  }
`;

export function createScreenColorMaterial(
  texture: Texture,
  screenColor: ScreenRgbColor,
  multiplyColor: ScreenRgbColor = { r: 1, g: 1, b: 1 },
  opacity = 1,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTexture: new Uniform(texture),
      uScreenColor: new Uniform(new Vector3(screenColor.r, screenColor.g, screenColor.b)),
      uMultiplyColor: new Uniform(
        new Vector3(multiplyColor.r, multiplyColor.g, multiplyColor.b),
      ),
      uOpacity: new Uniform(opacity),
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
  multiplyColor: ScreenRgbColor = { r: 1, g: 1, b: 1 },
  opacity = 1,
): void {
  const u = material.uniforms.uScreenColor;
  if (u) {
    (u.value as Vector3).set(screenColor.r, screenColor.g, screenColor.b);
  }
  const multiply = material.uniforms.uMultiplyColor;
  if (multiply) {
    (multiply.value as Vector3).set(multiplyColor.r, multiplyColor.g, multiplyColor.b);
  }
  const alpha = material.uniforms.uOpacity;
  if (alpha) alpha.value = opacity;
}

export function canvasToThreeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  return tex;
}
