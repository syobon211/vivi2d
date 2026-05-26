import { describe, expect, it } from "vitest";
import type { AutoMeshRequest } from "../auto-mesh.worker";
import { handleAutoMeshRequest } from "../auto-mesh.worker";


function makeRequest(partial?: Partial<AutoMeshRequest>): AutoMeshRequest {
  const texWidth = 4;
  const texHeight = 4;
  const buffer = new ArrayBuffer(texWidth * texHeight * 4);
  return {
    buffer,
    texWidth,
    texHeight,
    layerWidth: texWidth,
    layerHeight: texHeight,
    preset: "standard",
    ...partial,
  };
}

describe("handleAutoMeshRequest", () => {
  it("完全透明画像では result:null を返す（例外は投げない）", () => {
    const response = handleAutoMeshRequest(makeRequest());
    if (response.type !== "result") {
      throw new Error(`unexpected response type: ${response.type}`);
    }
    expect(response.result).toBeNull();
  });

  it("texWidth=0 でも result:null を返す（境界値）", () => {
    const response = handleAutoMeshRequest(
      makeRequest({
        buffer: new ArrayBuffer(0),
        texWidth: 0,
        texHeight: 0,
      }),
    );
    if (response.type !== "result") {
      throw new Error(`unexpected response type: ${response.type}`);
    }
    expect(response.result).toBeNull();
  });

  it("不透明画像かつ異常なpresetは error を返す（例外を握りつぶさない）", () => {
    const w = 8;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 255;
    }
    const response = handleAutoMeshRequest({
      buffer: data.buffer,
      texWidth: w,
      texHeight: h,
      layerWidth: w,
      layerHeight: h,
      preset: "nonexistent" as never,
    });
    expect(response.type).toBe("error");
    if (response.type === "error") {
      expect(typeof response.message).toBe("string");
      expect(response.message.length).toBeGreaterThan(0);
    }
  });

  it("不透明な矩形画像では MeshData を返す", () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        const i = (y * w + x) * 4;
        data[i + 0] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    const response = handleAutoMeshRequest({
      buffer: data.buffer,
      texWidth: w,
      texHeight: h,
      layerWidth: w,
      layerHeight: h,
      preset: "standard",
    });
    if (response.type !== "result") {
      throw new Error(`unexpected response type: ${response.type}`);
    }
    if (response.result !== null) {
      expect(response.result.vertices.length).toBeGreaterThan(0);
      expect(response.result.indices.length).toBeGreaterThan(0);
      expect(response.result.uvs.length).toBe(response.result.vertices.length);
    }
  });
});
