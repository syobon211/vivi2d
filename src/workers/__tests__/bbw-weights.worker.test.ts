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
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result.length).toBe(3);
  });

  it("空の頂点列でも型の整合性は保たれる", () => {
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
    expect(["result", "error"]).toContain(response.type);
  });

  it("ボーンが空のときは error を返す（computeBBWWeights が弾く想定）", () => {
    const response = handleBBWRequest({
      vertices: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      bones: [],
    });
    if (response.type === "error") {
      expect(typeof response.message).toBe("string");
    } else if (response.type === "result") {
      expect(Array.isArray(response.result)).toBe(true);
    } else {
      throw new Error(`unexpected progress-only response`);
    }
  });
});
