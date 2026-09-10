import { describe, expect, it } from "vitest";
import { Texture, Vector3 } from "three";
import {
  createScreenColorMaterial,
  updateScreenColorMaterial,
} from "../screen-color-material";

describe("Three screen-color material", () => {
  it("uses the built-in ShaderMaterial UV attribute and straight-alpha output", () => {
    const material = createScreenColorMaterial(new Texture(), { r: 0, g: 0, b: 0 });
    // Three supplies this attribute in its ShaderMaterial vertex prefix.
    expect(material.vertexShader).not.toMatch(/attribute\s+vec2\s+uv\s*;/);
    expect(material.fragmentShader).toContain("vec4(screen, color.a * uOpacity)");
    expect(material.premultipliedAlpha).toBe(false);
    material.dispose();
  });

  it("preserves opacity and multiply color when enabling and updating screen color", () => {
    const material = createScreenColorMaterial(
      new Texture(),
      { r: 0.1, g: 0.2, b: 0.3 },
      { r: 0.4, g: 0.5, b: 0.6 },
      0.25,
    );
    expect(material.uniforms.uMultiplyColor!.value).toEqual(new Vector3(0.4, 0.5, 0.6));
    expect(material.uniforms.uOpacity!.value).toBe(0.25);
    updateScreenColorMaterial(
      material,
      { r: 0.2, g: 0.3, b: 0.4 },
      { r: 0.5, g: 0.6, b: 0.7 },
      0.75,
    );
    expect(material.uniforms.uScreenColor!.value).toEqual(new Vector3(0.2, 0.3, 0.4));
    expect(material.uniforms.uMultiplyColor!.value).toEqual(new Vector3(0.5, 0.6, 0.7));
    expect(material.uniforms.uOpacity!.value).toBe(0.75);
    material.dispose();
  });
});
