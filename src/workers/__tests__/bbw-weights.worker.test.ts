import { describe, expect, it } from "vitest";
import { handleBBWRequest } from "../bbw-weights.worker";

describe("handleBBWRequest", () => {
  it("正常な単純メッシュでは result を返す", () => {
    const response = handleBBWRequest({
      vertices: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      bones: [
        {
          id: "b1",
          x: 0.5,
          y: 0.5,
          parentId: null,
        },
      ],
    });
    if (response.type !== "result") {
      throw new Error(`unexpected response type: ${response.type}`);
    }
    expect(response.result).toEqual([
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b1", weight: 1 }],
      [{ boneId: "b1", weight: 1 }],
    ]);
  });

  it("空の頂点列には空のweightsを返す", () => {
    const response = handleBBWRequest({
      vertices: [],
      indices: [],
      bones: [
        {
          id: "b1",
          x: 0,
          y: 0,
          parentId: null,
        },
      ],
    });
    expect(response).toEqual({ type: "result", result: [] });
  });

  it("ボーンが空のときは各頂点に空のweightsを返す", () => {
    const response = handleBBWRequest({
      vertices: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      bones: [],
    });
    expect(response).toEqual({ type: "result", result: [[], [], []] });
  });
});
